import hashlib
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
import jwt
from flask import current_app, g, jsonify, request


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def validate_password(password: str):
    """Return a validation message for weak passwords, otherwise None."""
    if len(password or "") < 8:
        return "Password must be at least 8 characters"
    if not any(ch.isalpha() for ch in password) or not any(ch.isdigit() for ch in password):
        return "Password must contain at least one letter and one number"
    return None


def validate_positive_number(value, field_name: str, allow_zero: bool = False):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return f"{field_name} must be a valid number"
    if allow_zero and number < 0:
        return f"{field_name} cannot be negative"
    if not allow_zero and number <= 0:
        return f"{field_name} must be greater than zero"
    return None


def _password_version(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def make_token(user):
    now = datetime.utcnow()
    payload = {
        "sub": user["username"],
        "uid": user["id"],
        "name": user["name"],
        "role": user["role"],
        "pwv": _password_version(user["password_hash"]),
        "iat": now,
        "exp": now + timedelta(hours=12),
    }
    cfg = current_app.config
    return jwt.encode(payload, cfg["JWT_SECRET"], algorithm=cfg["JWT_ALGO"])


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = auth.split(" ", 1)[1]
        cfg = current_app.config
        try:
            claims = jwt.decode(token, cfg["JWT_SECRET"], algorithms=[cfg["JWT_ALGO"]])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired, please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        from app.db import get_conn
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE username=%s AND is_active=1",
                (claims.get("sub"),),
            )
            row = cur.fetchone()
        if not row or _password_version(row["password_hash"]) != claims.get("pwv"):
            return jsonify({"error": "Your login details were updated — please log in again"}), 401

        g.user = claims
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if g.get("user", {}).get("role") != "Admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_fields(data: dict, fields: list):
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        return f"Missing required field(s): {', '.join(missing)}"
    return None
