from __future__ import annotations

import csv
import io
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import main
import master_audit

router = APIRouter(prefix="/api/audits", tags=["master-audit-ai"])

_TEMPLATE_URLS = [
    "https://raw.githubusercontent.com/mrsergeyesmirnov-svg/-1/main/docs/akademiya-schastya/platform/data/master-audit-01.csv",
    "https://raw.githubusercontent.com/mrsergeyesmirnov-svg/-1/main/docs/akademiya-schastya/platform/data/master-audit-02.csv",
    "https://raw.githubusercontent.com/mrsergeyesmirnov-svg/-1/main/docs/akademiya-schastya/platform/data/master-audit-03.csv",
]
_TEMPLATE_CACHE: list[dict[str, Any]] | None = None

AI_DDL = """
CREATE TABLE IF NOT EXISTS academy_audit_ai_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES academy_audit_sessions(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  proposed_count INTEGER NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_academy_audit_ai_runs_session
  ON academy_audit_ai_runs (session_id, created_at DESC);
"""


async def _ensure_ai_schema() -> None:
    await master_audit.ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(AI_DDL)


def _openai_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="ИИ не настроен: добавьте OPENAI_API_KEY в Railway Variables",
        )
    return key


async def _load_template() -> list[dict[str, Any]]:
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is not None:
        return _TEMPLATE_CACHE
    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for url in _TEMPLATE_URLS:
            response = await client.get(url)
            response.raise_for_status()
            reader = csv.DictReader(io.StringIO(response.text))
            for raw in reader:
                rows.append(
                    {
                        "id": int(raw["id"]),
                        "code": raw.get("code", ""),
                        "section": raw.get("section", ""),
                        "weight": float(raw.get("weight") or 0),
                        "critical": raw.get("critical") == "ДА",
                        "standard": raw.get("standard", ""),
                        "evidence": raw.get("evidence", ""),
                    }
                )
    rows.sort(key=lambda x: x["id"])
    if len(rows) != 150:
        raise HTTPException(status_code=503, detail=f"Методика аудита содержит {len(rows)} пунктов вместо 150")
    _TEMPLATE_CACHE = rows
    return rows


async def _transcribe(filename: str, content_type: str, payload: bytes) -> str:
    if len(payload) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл больше 50 МБ. Сожмите запись или разделите её на части")
    model = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-transcribe").strip() or "gpt-transcribe"
    headers = {"Authorization": f"Bearer {_openai_key()}"}
    files = {
        "file": (
            filename or "recording.m4a",
            payload,
            content_type or "application/octet-stream",
        )
    }
    data = {
        "model": model,
        "response_format": "json",
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers=headers,
            data=data,
            files=files,
        )
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message", response.text)
        except Exception:
            detail = response.text
        raise HTTPException(status_code=502, detail=f"Ошибка расшифровки: {detail[:500]}")
    data_out = response.json()
    text = str(data_out.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Не удалось получить текст из записи")
    return text


def _response_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
    return ""


async def _analyze(transcript: str, template: list[dict[str, Any]]) -> dict[str, Any]:
    model = os.getenv("OPENAI_AUDIT_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna"
    standards = "\n".join(
        f'{x["id"]}|{x["code"]}|{x["section"]}|{x["standard"]}|Проверка: {x["evidence"]}'
        for x in template
    )
    transcript = transcript[:300_000]
    prompt = f"""
Ты — ассистент ресторанного аудитора Академии счастья. Твоя задача — извлечь из расшифровки только те ответы Master Audit, которые реально подтверждены словами или наблюдениями в записи.

Правила оценки:
- 0 = из записи прямо следует, что стандарта нет, он не выполняется или есть явный противоположный факт.
- 1 = практика есть частично, нестабильно, зависит от человека или есть смешанные свидетельства.
- 2 = из записи есть ясное подтверждение, что стандарт существует и регулярно/системно выполняется.
- Если данных недостаточно, пункт НЕ включай вообще. Отсутствие упоминания не означает 0.
- Не додумывай за ресторан и не делай вывод только из общих фраз вроде «у нас всё хорошо».
- Для каждого ответа дай короткое evidence — конкретный факт из записи, без выдуманных цитат.
- confidence от 0 до 1 показывает уверенность именно в выставлении этого балла.
- Будь консервативен: лучше оставить пункт пустым, чем заполнить его без основания.

MASTER AUDIT (150 пунктов):
{standards}

РАСШИФРОВКА / ЗАМЕТКИ:
{transcript}
""".strip()

    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "answers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "item_id": {"type": "integer", "minimum": 1, "maximum": 150},
                        "score": {"type": "integer", "enum": [0, 1, 2]},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "evidence": {"type": "string"},
                        "comment": {"type": "string"},
                    },
                    "required": ["item_id", "score", "confidence", "evidence", "comment"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["summary", "answers"],
        "additionalProperties": False,
    }
    body = {
        "model": model,
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "restaurant_master_audit_extraction",
                "strict": True,
                "schema": schema,
            }
        },
    }
    headers = {
        "Authorization": f"Bearer {_openai_key()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers=headers,
            json=body,
        )
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message", response.text)
        except Exception:
            detail = response.text
        raise HTTPException(status_code=502, detail=f"Ошибка ИИ-анализа: {detail[:500]}")
    text = _response_text(response.json())
    if not text:
        raise HTTPException(status_code=502, detail="ИИ не вернул структурированный результат")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="ИИ вернул некорректный JSON") from exc


@router.post("/{audit_id}/ai-ingest")
async def ai_ingest(
    audit_id: str,
    note: str = Form(default=""),
    overwrite: bool = Form(default=False),
    file: UploadFile | None = File(default=None),
    username: str = Depends(main.require_session),
) -> dict[str, Any]:
    await _ensure_ai_schema()
    pool = await main.get_pool()
    session = await pool.fetchrow("SELECT * FROM academy_audit_sessions WHERE id=$1", audit_id)
    if not session:
        raise HTTPException(status_code=404, detail="Аудит не найден")
    if session["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="Завершённый аудит нельзя менять через ИИ")

    parts: list[str] = []
    source_name = "текстовая заметка"
    if note.strip():
        parts.append(note.strip())
    if file is not None:
        source_name = file.filename or "голосовая запись"
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Файл пустой")
        transcript = await _transcribe(source_name, file.content_type or "", raw)
        parts.append(transcript)
    if not parts:
        raise HTTPException(status_code=400, detail="Добавьте голосовую запись, файл разговора или текст")

    transcript_all = "\n\n".join(parts).strip()
    template = await _load_template()
    by_id = {x["id"]: x for x in template}
    result = await _analyze(transcript_all, template)
    proposed = result.get("answers") or []
    threshold = float(os.getenv("OPENAI_AUDIT_CONFIDENCE", "0.72") or "0.72")
    run_id = "air_" + secrets.token_hex(8)

    existing_rows = await pool.fetch(
        "SELECT item_id, score, is_na FROM academy_audit_answers WHERE session_id=$1",
        audit_id,
    )
    existing = {int(r["item_id"]): r for r in existing_rows}
    applied: list[dict[str, Any]] = []
    skipped = 0

    async with pool.acquire() as conn:
        async with conn.transaction():
            for candidate in proposed:
                try:
                    item_id = int(candidate.get("item_id"))
                    score = int(candidate.get("score"))
                    confidence = float(candidate.get("confidence") or 0)
                except (TypeError, ValueError):
                    skipped += 1
                    continue
                item = by_id.get(item_id)
                if not item or score not in (0, 1, 2) or confidence < threshold:
                    skipped += 1
                    continue
                old = existing.get(item_id)
                if old and not overwrite and (old["is_na"] or old["score"] is not None):
                    skipped += 1
                    continue
                evidence = str(candidate.get("evidence") or "").strip()[:1800]
                extra = str(candidate.get("comment") or "").strip()[:1200]
                comment = f"AI {round(confidence * 100)}% · {evidence}"
                if extra and extra.lower() != evidence.lower():
                    comment += f" · {extra}"
                await conn.execute(
                    """
                    INSERT INTO academy_audit_answers
                      (session_id,item_id,item_code,section,weight,critical,standard,evidence_hint,score,is_na,comment,updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,now())
                    ON CONFLICT (session_id,item_id) DO UPDATE SET
                      item_code=EXCLUDED.item_code,
                      section=EXCLUDED.section,
                      weight=EXCLUDED.weight,
                      critical=EXCLUDED.critical,
                      standard=EXCLUDED.standard,
                      evidence_hint=EXCLUDED.evidence_hint,
                      score=EXCLUDED.score,
                      is_na=false,
                      comment=EXCLUDED.comment,
                      updated_at=now()
                    """,
                    audit_id,
                    item_id,
                    item["code"],
                    item["section"],
                    item["weight"],
                    item["critical"],
                    item["standard"],
                    item["evidence"],
                    score,
                    comment,
                )
                applied.append(
                    {
                        "item_id": item_id,
                        "code": item["code"],
                        "score": score,
                        "confidence": confidence,
                        "evidence": evidence,
                    }
                )

            await conn.execute(
                """
                INSERT INTO academy_audit_ai_runs
                  (id,session_id,source_name,transcript,summary,proposed_count,applied_count,result,created_by,created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
                """,
                run_id,
                audit_id,
                source_name,
                transcript_all,
                str(result.get("summary") or "")[:5000],
                len(proposed),
                len(applied),
                json.dumps(result, ensure_ascii=False),
                username,
                datetime.now(timezone.utc),
            )

    return {
        "ok": True,
        "run_id": run_id,
        "source_name": source_name,
        "summary": str(result.get("summary") or ""),
        "transcript_preview": transcript_all[:1200],
        "proposed_count": len(proposed),
        "applied_count": len(applied),
        "skipped_count": skipped,
        "confidence_threshold": threshold,
        "applied": applied,
    }
