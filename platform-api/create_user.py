"""Создаёт запись пользователя для PLATFORM_USERS_JSON без 2FA/TOTP."""
import base64
import getpass
import hashlib
import json
import secrets
import sys

username = (sys.argv[1] if len(sys.argv) > 1 else input("Логин: ")).strip()
password = getpass.getpass("Пароль (минимум 12 символов): ")
if not username or len(password) < 12:
    raise SystemExit("Нужны логин и пароль минимум из 12 символов")
salt = secrets.token_bytes(16)
digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
password_hash = "$".join(
    base64.urlsafe_b64encode(x).decode().rstrip("=") for x in (salt, digest)
)
print("\nДобавьте запись в PLATFORM_USERS_JSON:")
print(json.dumps({"username": username, "password_hash": password_hash}, ensure_ascii=False))
