"""
Symmetric encryption for sensitive credentials stored in database.
Uses Fernet (AES-128-CBC with HMAC) derived from the application SECRET_KEY.
"""
import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings


def _derive_fernet_key() -> bytes:
    """Derive a Fernet-compatible 32-byte key from SECRET_KEY."""
    # Use SHA256 to get consistent 32 bytes, then base64 encode for Fernet
    key_hash = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(key_hash)


def encrypt_credential(plaintext: str) -> str:
    """
    Encrypt a credential string for database storage.
    Returns base64-encoded ciphertext prefixed with 'enc:'.
    """
    if not plaintext:
        return ""

    fernet = Fernet(_derive_fernet_key())
    encrypted = fernet.encrypt(plaintext.encode())
    return f"enc:{encrypted.decode()}"


def decrypt_credential(stored_value: str) -> str:
    """
    Decrypt a stored credential.
    Handles both encrypted (enc: prefix) and legacy plaintext values.
    """
    if not stored_value:
        return ""

    # Check if encrypted (has enc: prefix)
    if stored_value.startswith("enc:"):
        try:
            fernet = Fernet(_derive_fernet_key())
            encrypted_part = stored_value[4:]  # Remove 'enc:' prefix
            decrypted = fernet.decrypt(encrypted_part.encode())
            return decrypted.decode()
        except InvalidToken:
            # Corrupted or wrong key - return empty for security
            return ""

    # Legacy plaintext - return as-is (for backward compatibility)
    return stored_value


def is_encrypted(stored_value: str) -> bool:
    """Check if a stored value is encrypted."""
    return stored_value.startswith("enc:") if stored_value else False
