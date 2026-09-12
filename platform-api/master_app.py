from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, Field

import main
import master_audit
import audit_ai
import audit_exports

app = main.app

# Remove the old TOTP-required login route. The rest of the existing session
# mechanism stays unchanged: signed HttpOnly cookie, rate limit and SESSION_SECRET.
app.router.routes[:] = [
    route
    for route in app.router.routes
    if not (getattr(route, "path", None) == "/api/auth/login" and "POST" in getattr(route, "methods", set()))
]


class PasswordLoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=200)
    remember: bool = True


@app.post("/api/auth/login")
async def password_login(
    body: PasswordLoginIn,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    ip = request.client.host if request.client else "unknown"
    main._rate_limit(f"login:{ip}", 8, 15 * 60)
    user = main._users().get(body.username)
    if not user or not main._verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token, ttl = main._make_session(body.username, body.remember)
    response.set_cookie(
        main.SESSION_COOKIE,
        token,
        max_age=ttl,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"ok": True, "user": body.username}


app.include_router(master_audit.router)
app.include_router(audit_ai.router)

app.include_router(audit_exports.router)
