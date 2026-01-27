import base64
from io import BytesIO

import pyotp
import qrcode


def generate_totp_secret() -> str:
    """Generate a random TOTP secret."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str, issuer: str = "VM Portal") -> str:
    """Get the otpauth:// URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=issuer)


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a TOTP code against a secret. Allows 1 period tolerance."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_qr_base64(uri: str) -> str:
    """Generate a QR code as base64-encoded PNG."""
    qr = qrcode.QRCode(version=1, box_size=6, border=4)
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.getvalue()).decode("utf-8")
