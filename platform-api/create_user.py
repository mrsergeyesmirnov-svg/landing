"""Создаёт запись пользователя для PLATFORM_USERS_JSON, не сохраняя секреты на диск."""
import base64
import getpass
import hashlib
import json
import secrets
import sys
import urllib.parse

username = (sys.argv[1] if len(sys.argv) > 1 else input("Логин: ")).strip()
password = getpass.getpass("Пароль (минимум 12 символов): ")
if not username or len(password) < 12:
    raise SystemExit("Нужны логин и пароль минимум из 12 символов")
salt = secrets.token_bytes(16)
digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
password_hash = "$".join(
    base64.urlsafe_b64encode(x).decode().rstrip("=") for x in (salt, digest)
)
totp_secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
label = urllib.parse.quote(f"Academy CRM:{username}")
uri = f"otpauth://totp/{label}?secret={totp_secret}&issuer=Academy%20CRM"
print("\nДобавьте запись в PLATFORM_USERS_JSON:")
print(json.dumps({"username": username, "password_hash": password_hash, "totp_secret": totp_secret}, ensure_ascii=False))
print("\nДобавьте в приложение-аутентификатор:")
print(uri)
