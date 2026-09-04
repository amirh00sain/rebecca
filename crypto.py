"""AES-GCM encryption helpers matching the Cloudflare Worker worker.js crypto layer.

Tokens are stored as ``v1:<base64 iv>:<base64 ciphertext+tag>``.
The key is derived by SHA-256-digesting the raw ENCRYPTION_KEY string.
"""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_PREFIX = "v1:"


def _derive_key(encryption_key: str) -> bytes:
    """SHA-256 of the raw ENCRYPTION_KEY — identical to the worker's getKey()."""
    return hashlib.sha256(encryption_key.encode("utf-8")).digest()


def encrypt(plain: str, encryption_key: str) -> str:
    """Encrypt *plain* -> ``v1:<b64 nonce>:<b64 ct>``."""
    key = _derive_key(encryption_key)
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plain.encode("utf-8"), None)
    return _PREFIX + base64.b64encode(nonce).decode() + ":" + base64.b64encode(ct).decode()


def decrypt(blob: str, encryption_key: str) -> str:
    """Decrypt a ``v1:`` blob back to plaintext."""
    parts = str(blob).split(":")
    if len(parts) != 3:
        raise ValueError("bad ciphertext")
    key = _derive_key(encryption_key)
    nonce = base64.b64decode(parts[1])
    ct = base64.b64decode(parts[2])
    pt = AESGCM(key).decrypt(nonce, ct, None)
    return pt.decode("utf-8")
