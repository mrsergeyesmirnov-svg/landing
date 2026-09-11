from __future__ import annotations

import asyncio
import json
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import main

router = APIRouter(prefix="/api/audits", tags=["master-audit"])
_schema_lock = asyncio.Lock()
_schema_ready = False

AUDIT_DDL = """
CREATE TABLE IF NOT EXISTS academy_audit_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES academy_clients(id) ON DELETE SET NULL,
  restaurant_title TEXT NOT NULL DEFAULT '',
  audit_type TEXT NOT NULL DEFAULT 'day0',
  template_version TEXT NOT NULL DEFAULT 'AH-AUDIT-1.0',
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_by TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  overall_score DOUBLE PRECISION,
  red_flags_count INTEGER NOT NULL DEFAULT 0,
  block_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_healthy_baseline BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_academy_audit_client_time
  ON academy_audit_sessions (client_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_audit_title_time
  ON academy_audit_sessions (restaurant_title, started_at DESC);

CREATE TABLE IF NOT EXISTS academy_audit_answers (
  session_id TEXT NOT NULL REFERENCES academy_audit_sessions(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_code TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  critical BOOLEAN NOT NULL DEFAULT false,
  standard TEXT NOT NULL DEFAULT '',
  evidence_hint TEXT NOT NULL DEFAULT '',
  score SMALLINT,
  is_na BOOLEAN NOT NULL DEFAULT false,
  comment TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, item_id),
  CONSTRAINT academy_audit_score_check CHECK (score IS NULL OR score BETWEEN 0 AND 2)
);

CREATE INDEX IF NOT EXISTS idx_academy_audit_answers_session
  ON academy_audit_answers (session_id, item_id);

CREATE TABLE IF NOT EXISTS academy_audit_baselines (
  baseline_key TEXT PRIMARY KEY,
  client_id TEXT REFERENCES academy_clients(id) ON DELETE CASCADE,
  restaurant_title TEXT NOT NULL DEFAULT '',
  source_session_id TEXT NOT NULL REFERENCES academy_audit_sessions(id) ON DELETE CASCADE,
  overall_score DOUBLE PRECISION NOT NULL,
  red_flags_count INTEGER NOT NULL DEFAULT 0,
  block_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


async def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    async with _schema_lock:
        if _schema_ready:
            return
        pool = await main.get_pool()
        async with pool.acquire() as conn:
            await conn.execute(AUDIT_DDL)
        _schema_ready = True
        print("[master-audit] schema ready")


def _json_obj(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _session_row(r: Any) -> dict[str, Any]:
    return {
        "id": r["id"],
        "client_id": r["client_id"],
        "restaurant_title": r["restaurant_title"] or "",
        "audit_type": r["audit_type"],
        "template_version": r["template_version"],
        "status": r["status"],
        "created_by": r["created_by"],
        "started_at": r["started_at"].isoformat() if r["started_at"] else None,
        "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
        "overall_score": float(r["overall_score"]) if r["overall_score"] is not None else None,
        "red_flags_count": int(r["red_flags_count"] or 0),
        "block_scores": _json_obj(r["block_scores"]),
        "is_healthy_baseline": bool(r["is_healthy_baseline"]),
    }


class AuditStartIn(BaseModel):
    client_id: str | None = Field(default=None, max_length=120)
    restaurant_title: str = Field(..., min_length=1, max_length=200)
    audit_type: str = Field(default="day0", max_length=20)
    template_version: str = Field(default="AH-AUDIT-1.0", max_length=40)


class AuditAnswerIn(BaseModel):
    item_code: str = Field(default="", max_length=30)
    section: str = Field(default="", max_length=200)
    weight: float = 0
    critical: bool = False
    standard: str = Field(default="", max_length=1800)
    evidence_hint: str = Field(default="", max_length=1800)
    score: int | None = None
    is_na: bool = False
    comment: str = Field(default="", max_length=5000)


@router.get("")
async def list_audits(
    client_id: str | None = None,
    limit: int = 50,
    _: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    pool = await main.get_pool()
    limit = max(1, min(int(limit), 100))
    if client_id:
        rows = await pool.fetch(
            "SELECT * FROM academy_audit_sessions WHERE client_id=$1 ORDER BY started_at DESC LIMIT $2",
            client_id,
            limit,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM academy_audit_sessions ORDER BY started_at DESC LIMIT $1",
            limit,
        )
    return {"ok": True, "audits": [_session_row(r) for r in rows]}


@router.post("")
async def start_audit(
    body: AuditStartIn,
    username: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    audit_type = body.audit_type.strip().lower()
    if audit_type not in {"day0", "day30", "day60", "extra"}:
        raise HTTPException(status_code=400, detail="Некорректный тип аудита")
    pool = await main.get_pool()
    client_id = body.client_id.strip() if body.client_id else None
    async with pool.acquire() as conn:
        if client_id:
            exists = await conn.fetchval("SELECT 1 FROM academy_clients WHERE id=$1", client_id)
            if not exists:
                raise HTTPException(status_code=404, detail="Клиент CRM не найден")
        audit_id = "aud_" + secrets.token_hex(8)
        row = await conn.fetchrow(
            """
            INSERT INTO academy_audit_sessions
              (id, client_id, restaurant_title, audit_type, template_version, status, created_by)
            VALUES ($1,$2,$3,$4,$5,'in_progress',$6)
            RETURNING *
            """,
            audit_id,
            client_id,
            body.restaurant_title.strip(),
            audit_type,
            body.template_version.strip() or "AH-AUDIT-1.0",
            username,
        )
    return {"ok": True, "audit": _session_row(row)}


@router.get("/{audit_id}")
async def get_audit(
    audit_id: str,
    _: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM academy_audit_sessions WHERE id=$1", audit_id)
        if not row:
            raise HTTPException(status_code=404, detail="Аудит не найден")
        answer_rows = await conn.fetch(
            "SELECT * FROM academy_audit_answers WHERE session_id=$1 ORDER BY item_id",
            audit_id,
        )
        baseline = None
        baseline_key = row["client_id"] or ("title:" + (row["restaurant_title"] or "").strip().lower())
        if baseline_key:
            baseline = await conn.fetchrow(
                "SELECT * FROM academy_audit_baselines WHERE baseline_key=$1", baseline_key
            )
    answers = [
        {
            "item_id": int(a["item_id"]),
            "item_code": a["item_code"],
            "section": a["section"],
            "weight": float(a["weight"] or 0),
            "critical": bool(a["critical"]),
            "standard": a["standard"],
            "evidence_hint": a["evidence_hint"],
            "score": int(a["score"]) if a["score"] is not None else None,
            "is_na": bool(a["is_na"]),
            "comment": a["comment"] or "",
            "updated_at": a["updated_at"].isoformat() if a["updated_at"] else None,
        }
        for a in answer_rows
    ]
    baseline_out = None
    if baseline:
        baseline_out = {
            "source_session_id": baseline["source_session_id"],
            "overall_score": float(baseline["overall_score"]),
            "red_flags_count": int(baseline["red_flags_count"] or 0),
            "block_scores": _json_obj(baseline["block_scores"]),
            "created_by": baseline["created_by"],
            "created_at": baseline["created_at"].isoformat(),
        }
    return {"ok": True, "audit": _session_row(row), "answers": answers, "baseline": baseline_out}


@router.put("/{audit_id}/answers/{item_id}")
async def save_answer(
    audit_id: str,
    item_id: int,
    body: AuditAnswerIn,
    _: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    if not 1 <= item_id <= 150:
        raise HTTPException(status_code=400, detail="Некорректный пункт аудита")
    score = None if body.is_na else body.score
    if not body.is_na and score not in (0, 1, 2):
        raise HTTPException(status_code=400, detail="Оценка должна быть 0, 1, 2 или N/A")
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM academy_audit_sessions WHERE id=$1", audit_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Аудит не найден")
        if status != "in_progress":
            raise HTTPException(status_code=409, detail="Завершённый аудит нельзя редактировать")
        await conn.execute(
            """
            INSERT INTO academy_audit_answers
              (session_id,item_id,item_code,section,weight,critical,standard,evidence_hint,score,is_na,comment,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
            ON CONFLICT (session_id,item_id) DO UPDATE SET
              item_code=EXCLUDED.item_code,
              section=EXCLUDED.section,
              weight=EXCLUDED.weight,
              critical=EXCLUDED.critical,
              standard=EXCLUDED.standard,
              evidence_hint=EXCLUDED.evidence_hint,
              score=EXCLUDED.score,
              is_na=EXCLUDED.is_na,
              comment=EXCLUDED.comment,
              updated_at=now()
            """,
            audit_id,
            item_id,
            body.item_code,
            body.section,
            float(body.weight or 0),
            body.critical,
            body.standard,
            body.evidence_hint,
            score,
            body.is_na,
            body.comment,
        )
    return {"ok": True, "saved": True, "item_id": item_id}


async def _score_session(conn: Any, audit_id: str) -> dict[str, Any]:
    rows = await conn.fetch(
        "SELECT section,weight,critical,score,is_na FROM academy_audit_answers WHERE session_id=$1 ORDER BY item_id",
        audit_id,
    )
    if len(rows) != 150:
        raise HTTPException(status_code=409, detail=f"Заполнено {len(rows)} из 150 пунктов")
    active = [r for r in rows if not r["is_na"] and r["score"] is not None]
    denominator = sum(float(r["weight"] or 0) for r in active)
    numerator = sum((int(r["score"]) / 2.0) * float(r["weight"] or 0) for r in active)
    overall = round(numerator / denominator * 100, 1) if denominator else 0.0
    red_flags = sum(1 for r in active if r["critical"] and int(r["score"]) == 0)
    grouped: dict[str, dict[str, float]] = {}
    for r in active:
        key = str(r["section"] or "Без блока")
        bucket = grouped.setdefault(key, {"num": 0.0, "den": 0.0})
        weight = float(r["weight"] or 0)
        bucket["num"] += (int(r["score"]) / 2.0) * weight
        bucket["den"] += weight
    block_scores = {
        key: round(v["num"] / v["den"] * 100, 1) if v["den"] else 0.0
        for key, v in grouped.items()
    }
    return {"overall_score": overall, "red_flags_count": red_flags, "block_scores": block_scores}


@router.post("/{audit_id}/complete")
async def complete_audit(
    audit_id: str,
    _: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM academy_audit_sessions WHERE id=$1", audit_id)
        if not row:
            raise HTTPException(status_code=404, detail="Аудит не найден")
        score = await _score_session(conn, audit_id)
        row = await conn.fetchrow(
            """
            UPDATE academy_audit_sessions SET
              status='completed',
              completed_at=COALESCE(completed_at, now()),
              overall_score=$2,
              red_flags_count=$3,
              block_scores=$4::jsonb
            WHERE id=$1 RETURNING *
            """,
            audit_id,
            score["overall_score"],
            score["red_flags_count"],
            json.dumps(score["block_scores"], ensure_ascii=False),
        )
    return {"ok": True, "audit": _session_row(row)}


@router.post("/{audit_id}/baseline")
async def set_baseline(
    audit_id: str,
    username: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM academy_audit_sessions WHERE id=$1", audit_id)
        if not row:
            raise HTTPException(status_code=404, detail="Аудит не найден")
        if row["status"] != "completed" or row["overall_score"] is None:
            raise HTTPException(status_code=409, detail="Сначала завершите аудит")
        baseline_key = row["client_id"] or ("title:" + (row["restaurant_title"] or "").strip().lower())
        if not baseline_key:
            raise HTTPException(status_code=400, detail="Невозможно определить ресторан")
        await conn.execute(
            "UPDATE academy_audit_sessions SET is_healthy_baseline=false WHERE client_id IS NOT DISTINCT FROM $1 AND restaurant_title=$2",
            row["client_id"],
            row["restaurant_title"],
        )
        await conn.execute("UPDATE academy_audit_sessions SET is_healthy_baseline=true WHERE id=$1", audit_id)
        await conn.execute(
            """
            INSERT INTO academy_audit_baselines
              (baseline_key,client_id,restaurant_title,source_session_id,overall_score,red_flags_count,block_scores,created_by,created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now())
            ON CONFLICT (baseline_key) DO UPDATE SET
              client_id=EXCLUDED.client_id,
              restaurant_title=EXCLUDED.restaurant_title,
              source_session_id=EXCLUDED.source_session_id,
              overall_score=EXCLUDED.overall_score,
              red_flags_count=EXCLUDED.red_flags_count,
              block_scores=EXCLUDED.block_scores,
              created_by=EXCLUDED.created_by,
              created_at=now()
            """,
            baseline_key,
            row["client_id"],
            row["restaurant_title"],
            audit_id,
            float(row["overall_score"]),
            int(row["red_flags_count"] or 0),
            json.dumps(_json_obj(row["block_scores"]), ensure_ascii=False),
            username,
        )
    return {"ok": True, "baseline": True, "audit_id": audit_id}


@router.delete("/{audit_id}")
async def delete_draft(
    audit_id: str,
    _: str = Depends(main.require_session),
) -> dict[str, Any]:
    await ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM academy_audit_sessions WHERE id=$1", audit_id)
        if status is None:
            raise HTTPException(status_code=404, detail="Аудит не найден")
        if status != "in_progress":
            raise HTTPException(status_code=409, detail="Можно удалить только черновик")
        await conn.execute("DELETE FROM academy_audit_sessions WHERE id=$1", audit_id)
    return {"ok": True}
