import base64
import hashlib
import hmac
import json
import os
import time
import unittest
import asyncio
from types import SimpleNamespace
from fastapi import HTTPException

os.environ["SESSION_SECRET"] = "test-secret-that-is-longer-than-thirty-two-characters"

import main


class SecurityTests(unittest.TestCase):
    def setUp(self):
        salt = b"0123456789abcdef"
        digest = hashlib.pbkdf2_hmac("sha256", b"correct horse battery", salt, 310_000)
        encoded = "$".join(base64.urlsafe_b64encode(x).decode().rstrip("=") for x in (salt, digest))
        self.totp_secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
        os.environ["PLATFORM_USERS_JSON"] = json.dumps([{
            "username": "owner", "password_hash": encoded, "totp_secret": self.totp_secret
        }])

    def test_password_hash(self):
        user = main._users()["owner"]
        self.assertTrue(main._verify_password("correct horse battery", user["password_hash"]))
        self.assertFalse(main._verify_password("wrong password", user["password_hash"]))

    def test_current_totp(self):
        key = base64.b32decode(self.totp_secret + "=" * (-len(self.totp_secret) % 8))
        counter = int(time.time() // 30).to_bytes(8, "big")
        digest = hmac.new(key, counter, hashlib.sha1).digest()
        pos = digest[-1] & 15
        code = f"{(int.from_bytes(digest[pos:pos + 4], 'big') & 0x7fffffff) % 1_000_000:06d}"
        self.assertTrue(main._verify_totp(self.totp_secret, code))

    def test_telegram_username_only(self):
        self.assertTrue(main._valid_telegram("valid_name"))
        self.assertFalse(main._valid_telegram("123456789"))
        self.assertFalse(main._valid_telegram("bad-link/example"))

    def test_consent_version_is_explicit(self):
        self.assertEqual(main.CONSENT_VERSION, "2026-09-09-v1")

    def test_lead_requires_current_consent_and_one_contact(self):
        request = SimpleNamespace(client=SimpleNamespace(host="test-invalid-contact"))
        lead = main.LeadIn(consent=True, contactConsent=True,
                           consentVersion=main.CONSENT_VERSION,
                           preferredContact="telegram", telegram="123456")
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(main.create_lead(lead, request))
        self.assertEqual(caught.exception.status_code, 400)

        request = SimpleNamespace(client=SimpleNamespace(host="test-old-consent"))
        lead = main.LeadIn(consent=True, contactConsent=True,
                           consentVersion="old", preferredContact="telegram",
                           telegram="valid_name")
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(main.create_lead(lead, request))
        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
