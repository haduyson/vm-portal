import secrets
import string


def generate_random_password(length: int = 12) -> str:
    """Generate secure random password with upper, lower, digits."""
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure at least one of each type
        if (any(c.isupper() for c in password)
                and any(c.islower() for c in password)
                and any(c.isdigit() for c in password)):
            return password
