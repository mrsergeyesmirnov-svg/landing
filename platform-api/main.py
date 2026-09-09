"""
API платформы консультантов Академии счастья.

Подключается к той же Railway Postgres, что и Pulse-бот (DATABASE_URL).
Таблицы academy_* — отдельно от feedback_events / problems.

Переменные окружения:
  DATABASE_URL     — Postgres (обязательно)
  PLATFORM_USERS_JSON — учётные записи с хешами паролей и TOTP-секретами
  SESSION_SECRET      — ключ подписи защищённых сессий (минимум 32 символа)
  CORS_ORIGINS     — через запятую, по умолчанию https://www.pulseteam.online
"""
from __future__ import annotations

import json
import os
import time
import uuid
import base64
import hashlib
import hmac
import re
from datetime import datetime, timezone
from typing import Any

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Academy Platform API", version="1.0.0")

_pool: asyncpg.Pool | None = None

CORS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "https://www.pulseteam.online,https://pulseteam.online,http://localhost:8765,http://127.0.0.1:8765",
    ).split(",")
    if o.strip()
]
_origins = CORS if os.getenv("CORS_OPEN") != "1" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SESSION_COOKIE = "academy_session"
CONSENT_VERSION = "2026-09-09-v1"
_attempts: dict[str, list[float]] = {}


def _rate_limit(key: str, limit: int, window: int) -> None:
    now = time.time()
    hits = [t for t in _attempts.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Повторите позже")
    hits.append(now)
    _attempts[key] = hits


def _users() -> dict[str, dict[str, str]]:
    raw = os.getenv("PLATFORM_USERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        rows = json.loads(raw)
        return {str(x["username"]): x for x in rows if x.get("username")}
    except (ValueError, TypeError, KeyError):
        raise RuntimeError("PLATFORM_USERS_JSON задан неверно")


def _verify_password(password: str, encoded: str) -> bool:
    try:
        salt_b64, digest_b64 = encoded.split("$", 1)
        salt = base64.urlsafe_b64decode(salt_b64 + "==")
        expected = base64.urlsafe_b64decode(digest_b64 + "==")
    except (ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return hmac.compare_digest(actual, expected)


def _verify_totp(secret: str, code: str) -> bool:
    try:
        key = base64.b32decode(secret.upper().replace(" ", "") + "=" * (-len(secret) % 8))
        supplied = str(code).strip()
        for offset in (-1, 0, 1):
            counter = int(time.time() // 30) + offset
            msg = counter.to_bytes(8, "big")
            digest = hmac.new(key, msg, hashlib.sha1).digest()
            pos = digest[-1] & 15
            value = (int.from_bytes(digest[pos:pos + 4], "big") & 0x7fffffff) % 1_000_000
            if hmac.compare_digest(f"{value:06d}", supplied):
                return True
    except (ValueError, TypeError):
        pass
    return False


def _session_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET", "").encode()
    if len(secret) < 32:
        raise RuntimeError("SESSION_SECRET должен содержать минимум 32 символа")
    return secret


def _make_session(username: str, remember: bool) -> tuple[str, int]:
    ttl = 30 * 86400 if remember else 12 * 3600
    payload = f"{username}|{int(time.time()) + ttl}|{uuid.uuid4().hex}"
    sig = hmac.new(_session_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode(), ttl


def require_session(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE, "")
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        username, expiry, nonce, sig = raw.split("|", 3)
        payload = f"{username}|{expiry}|{nonce}"
        expected = hmac.new(_session_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if int(expiry) < int(time.time()) or not hmac.compare_digest(sig, expected):
            raise ValueError
        if username not in _users():
            raise ValueError
        return username
    except (ValueError, TypeError, UnicodeError):
        raise HTTPException(status_code=401, detail="Требуется вход")


class LoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=200)
    otp: str = Field(..., min_length=6, max_length=6)
    remember: bool = True


@app.post("/api/auth/login")
async def login(body: LoginIn, request: Request, response: Response) -> dict[str, Any]:
    ip = request.client.host if request.client else "unknown"
    _rate_limit(f"login:{ip}", 8, 15 * 60)
    user = _users().get(body.username)
    if not user or not _verify_password(body.password, user.get("password_hash", "")) or not _verify_totp(user.get("totp_secret", ""), body.otp):
        raise HTTPException(status_code=401, detail="Неверные данные входа")
    token, ttl = _make_session(body.username, body.remember)
    response.set_cookie(SESSION_COOKIE, token, max_age=ttl, httponly=True, secure=True, samesite="lax", path="/")
    return {"ok": True, "user": body.username}


@app.get("/api/auth/me")
async def auth_me(user: str = Depends(require_session)) -> dict[str, Any]:
    return {"ok": True, "user": user}


@app.post("/api/auth/logout")
async def logout(response: Response) -> dict[str, Any]:
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    return {"ok": True}


def _uid(prefix: str = "c") -> str:
    return f"{prefix}{int(time.time() * 1000):x}{uuid.uuid4().hex[:5]}"


def _ms(dt: datetime | None) -> int:
    if not dt:
        return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _row_client(r: asyncpg.Record) -> dict[str, Any]:
    comments = r["comments"]
    docs = r["docs"]
    if isinstance(comments, str):
        comments = json.loads(comments)
    if isinstance(docs, str):
        docs = json.loads(docs)
    return {
        "id": r["id"],
        "name": r["name"] or "",
        "city": r["city"] or "",
        "contact": r["contact"] or "",
        "phone": r["phone"] or "",
        "telegram": r["telegram"] or "",
        "status": r["status"] or "lead",
        "notes": r["notes"] or "",
        "comments": comments or [],
        "docs": docs or [],
        "leadMeta": r["lead_meta"] or {},
        "createdAt": _ms(r["created_at"]),
        "updatedAt": _ms(r["updated_at"]),
    }


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise HTTPException(status_code=503, detail="БД не подключена")
    return _pool


@app.on_event("startup")
async def startup() -> None:
    global _pool
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        print("[platform-api] DATABASE_URL не задан")
        return
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://") :]
    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5, command_timeout=60)
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, encoding="utf-8") as f:
        ddl = f.read()
    async with _pool.acquire() as conn:
        await conn.execute(ddl)
    print("[platform-api] Postgres OK, schema academy_* готова")


@app.on_event("shutdown")
async def shutdown() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@app.get("/health")
async def health() -> dict[str, Any]:
    ok = _pool is not None
    return {"ok": ok, "db": ok}


# ─── Public: лид с калькулятора ───────────────────────────────────────────────


class LeadIn(BaseModel):
    restaurant: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=120)
    contact: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=32)
    telegram: str = Field(default="", max_length=64)
    size: str = Field(default="", max_length=8)
    sizeLabel: str = Field(default="", max_length=80)
    problemLabel: str = Field(default="", max_length=120)
    problemK: float = 1
    expertLabel: str = Field(default="", max_length=120)
    expertTier: str = Field(default="", max_length=40)
    priceMin: float = 0
    priceMax: float = 0
    note: str = Field(default="", max_length=4000)
    consent: bool = False
    contactConsent: bool = False
    preferredContact: str = Field(default="", max_length=16)
    consentVersion: str = Field(default="", max_length=40)
    source: str = Field(default="diagnostika", max_length=40)


def _norm_telegram(raw: str) -> str:
    t = (raw or "").strip()
    if t.startswith("@"):
        t = t[1:]
    for prefix in ("https://t.me/", "http://t.me/", "https://telegram.me/", "http://telegram.me/"):
        if t.lower().startswith(prefix):
            t = t[len(prefix) :]
            break
    return t.strip().rstrip("/")


def _valid_telegram(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", value))


_SOURCE_TITLE = {
    "put": "Состояние",
    "diagnostika": "Калькулятор",
    "sostoyanie": "Обсудить проект",
}


@app.post("/api/leads")
async def create_lead(body: LeadIn, request: Request) -> dict[str, Any]:
    ip = request.client.host if request.client else "unknown"
    _rate_limit(f"lead:{ip}", 12, 10 * 60)
    if not body.consent:
        raise HTTPException(status_code=400, detail="Нужно согласие на обработку ПДн")
    phone = "".join(ch for ch in body.phone if ch.isdigit())
    telegram = _norm_telegram(body.telegram)
    if body.preferredContact not in {"phone", "telegram"}:
        raise HTTPException(status_code=400, detail="Выберите способ связи")
    if body.preferredContact == "phone" and len(phone) != 11:
        raise HTTPException(status_code=400, detail="Укажите телефон")
    if body.preferredContact == "telegram" and not _valid_telegram(telegram):
        raise HTTPException(status_code=400, detail="Укажите Telegram username")
    if body.phone and len(phone) != 11:
        raise HTTPException(status_code=400, detail="Некорректный телефон")
    if telegram and not _valid_telegram(telegram):
        raise HTTPException(status_code=400, detail="Некорректный Telegram username")
    if not body.contactConsent:
        raise HTTPException(status_code=400, detail="Нужно согласие на обратную связь")
    if body.consentVersion != CONSENT_VERSION:
        raise HTTPException(status_code=400, detail="Обновите страницу согласия")
    tg_store = telegram if telegram.isdigit() else (f"@{telegram}" if telegram else "")
    pool = await get_pool()

    source = (body.source or "diagnostika").strip()[:40] or "diagnostika"
    source_title = _SOURCE_TITLE.get(source, source)
    contact = body.contact.strip()
    restaurant = (body.restaurant or "").strip()
    # Имя на доске CRM: контакт + метка источника (чтобы опросы было видно)
    if contact:
        name = f"{contact} · {source_title}"
    elif restaurant:
        name = restaurant
    else:
        name = f"Лид · {source_title}"

    meta = {
        "source": source,
        "size": body.size,
        "sizeLabel": body.sizeLabel,
        "problemLabel": body.problemLabel,
        "problemK": body.problemK,
        "expertLabel": body.expertLabel,
        "expertTier": body.expertTier,
        "priceMin": body.priceMin,
        "priceMax": body.priceMax,
        "telegram": telegram,
        "contactConsent": body.contactConsent,
        "preferredContact": body.preferredContact,
        "consentVersion": body.consentVersion,
        "ip": request.client.host if request.client else None,
    }
    note_bits = [
        f"=== {source_title} · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC ==="
    ]
    if body.note:
        note_bits.append(body.note)
    if tg_store:
        note_bits.append(f"Telegram: {tg_store}")
    if body.expertLabel or body.expertTier or body.sizeLabel:
        note_bits.append(
            f"Роль/метка: {body.expertLabel or '—'} · продукт: {body.expertTier or '—'} · "
            f"{body.sizeLabel or body.size or '—'}"
        )
    if body.problemLabel:
        note_bits.append(f"Итог: {body.problemLabel}")
    notes = "\n".join(note_bits)

    async with pool.acquire() as conn:
        now = datetime.now(timezone.utc)
        # Публичная форма никогда не изменяет существующую CRM-карточку:
        # совпавший/чужой контакт не должен позволять перезаписать клиента.
        client_id = _uid("c")
        await conn.execute(
            """
            INSERT INTO academy_clients
              (id, name, city, contact, phone, telegram, status, notes, lead_meta, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,'lead',$7,$8::jsonb,$9,$9)
            """,
            client_id,
            name,
            body.city.strip(),
            contact,
            phone,
            tg_store,
            notes,
            json.dumps(meta, ensure_ascii=False),
            now,
        )

        lead_id = await conn.fetchval(
            """
            INSERT INTO academy_leads
              (client_id, restaurant, city, contact, phone, size_code,
               problem_label, expert_label, price_min, price_max, note, consent,
               contact_consent, consent_version, preferred_contact, consented_at, payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
            RETURNING id
            """,
            client_id,
            name,
            body.city.strip(),
            contact,
            phone,
            body.size,
            body.problemLabel,
            body.expertLabel,
            body.priceMin,
            body.priceMax,
            body.note,
            True,
            True,
            body.consentVersion,
            body.preferredContact,
            now,
            json.dumps(meta, ensure_ascii=False),
        )

    return {"ok": True, "clientId": client_id, "leadId": lead_id}


# ─── Protected CRM ────────────────────────────────────────────────────────────


@app.get("/api/clients")
async def list_clients(_: str = Depends(require_session)) -> dict[str, Any]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM academy_clients ORDER BY updated_at DESC"
    )
    return {"clients": [_row_client(r) for r in rows]}


class ClientIn(BaseModel):
    id: str | None = None
    name: str = ""
    city: str = ""
    contact: str = ""
    phone: str = ""
    telegram: str = ""
    status: str = "lead"
    notes: str = ""


@app.post("/api/clients")
async def upsert_client(body: ClientIn, _: str = Depends(require_session)) -> dict[str, Any]:
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        if body.id:
            row = await conn.fetchrow(
                "SELECT id FROM academy_clients WHERE id = $1", body.id
            )
            if not row:
                raise HTTPException(status_code=404, detail="Клиент не найден")
            await conn.execute(
                """
                UPDATE academy_clients SET
                  name=$2, city=$3, contact=$4, phone=$5, telegram=$6,
                  status=$7, notes=$8, updated_at=$9
                WHERE id=$1
                """,
                body.id,
                body.name.strip(),
                body.city.strip(),
                body.contact.strip(),
                body.phone.strip(),
                body.telegram.strip(),
                body.status or "lead",
                body.notes,
                now,
            )
            client_id = body.id
        else:
            client_id = _uid("c")
            await conn.execute(
                """
                INSERT INTO academy_clients
                  (id, name, city, contact, phone, telegram, status, notes, created_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
                """,
                client_id,
                body.name.strip() or "Без имени",
                body.city.strip(),
                body.contact.strip(),
                body.phone.strip(),
                body.telegram.strip(),
                body.status or "lead",
                body.notes,
                now,
            )
        row = await conn.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
    return {"client": _row_client(row)}


@app.get("/api/clients/{client_id}")
async def get_client(client_id: str, _: str = Depends(require_session)) -> dict[str, Any]:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
    if not row:
        raise HTTPException(status_code=404, detail="Не найден")
    return {"client": _row_client(row)}


class CommentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


@app.post("/api/clients/{client_id}/comments")
async def add_comment(
    client_id: str, body: CommentIn, _: str = Depends(require_session)
) -> dict[str, Any]:
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    comment = {"id": _uid("m"), "text": body.text.strip(), "at": int(now.timestamp() * 1000)}
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT comments FROM academy_clients WHERE id = $1", client_id)
        if not row:
            raise HTTPException(status_code=404, detail="Не найден")
        comments = row["comments"] or []
        if isinstance(comments, str):
            comments = json.loads(comments)
        comments = [comment] + list(comments)
        await conn.execute(
            "UPDATE academy_clients SET comments=$2::jsonb, updated_at=$3 WHERE id=$1",
            client_id,
            json.dumps(comments, ensure_ascii=False),
            now,
        )
        row = await conn.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
    return {"client": _row_client(row)}


class DocIn(BaseModel):
    kind: str = "invoice"
    number: str = ""
    date: str = ""
    sum: float = 0
    title: str = ""
    html: str = ""
    snapshot: dict[str, Any] | None = None
    clientName: str | None = None
    city: str | None = None
    contact: str | None = None


@app.post("/api/clients/{client_id}/docs")
async def attach_doc(
    client_id: str, body: DocIn, _: str = Depends(require_session)
) -> dict[str, Any]:
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    doc = {
        "id": _uid("d"),
        "kind": body.kind,
        "number": body.number,
        "date": body.date,
        "sum": body.sum,
        "title": body.title,
        "html": body.html,
        "snapshot": body.snapshot,
        "at": int(now.timestamp() * 1000),
    }
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
        if not row and body.clientName:
            # create by name like local store
            client_id = _uid("c")
            await conn.execute(
                """
                INSERT INTO academy_clients
                  (id, name, city, contact, status, docs, created_at, updated_at)
                VALUES ($1,$2,$3,$4,'sale','[]'::jsonb,$5,$5)
                """,
                client_id,
                body.clientName,
                body.city or "",
                body.contact or "",
                now,
            )
            row = await conn.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
        if not row:
            raise HTTPException(status_code=404, detail="Не найден")
        docs = row["docs"] or []
        if isinstance(docs, str):
            docs = json.loads(docs)
        docs = [doc] + list(docs)
        await conn.execute(
            "UPDATE academy_clients SET docs=$2::jsonb, updated_at=$3 WHERE id=$1",
            client_id,
            json.dumps(docs, ensure_ascii=False),
            now,
        )
        row = await conn.fetchrow("SELECT * FROM academy_clients WHERE id = $1", client_id)
    return {"client": _row_client(row)}


@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str, _: str = Depends(require_session)) -> dict[str, Any]:
    pool = await get_pool()
    await pool.execute("DELETE FROM academy_clients WHERE id = $1", client_id)
    return {"ok": True}


@app.get("/api/leads")
async def list_leads(_: str = Depends(require_session)) -> dict[str, Any]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM academy_leads ORDER BY created_at DESC LIMIT 200"
    )
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "clientId": r["client_id"],
                "restaurant": r["restaurant"],
                "city": r["city"],
                "contact": r["contact"],
                "phone": r["phone"],
                "size": r["size_code"],
                "problemLabel": r["problem_label"],
                "expertLabel": r["expert_label"],
                "priceMin": float(r["price_min"] or 0),
                "priceMax": float(r["price_max"] or 0),
                "note": r["note"],
                "createdAt": _ms(r["created_at"]),
            }
        )
    return {"leads": out}
