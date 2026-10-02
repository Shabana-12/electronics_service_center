from flask import Blueprint, request, jsonify, g
from ..db import get_conn
from ..security import (
    check_password, make_token, hash_password, login_required, admin_required,
    require_fields, validate_password,
)
from .. import limiter

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/login")
@limiter.limit("10 per minute")   # slows down password-guessing attacks
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM users WHERE username=%s AND is_active=1", (username,)
        )
        user = cur.fetchone()

    # Same generic error whether the username doesn't exist or the password is
    # wrong — don't tell an attacker which one it was.
    if not user or not check_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid username or password"}), 401

    token = make_token(user)
    return jsonify({"token": token, "name": user["name"], "role": user["role"]})

# ---- User account management (Settings page — Admin only) ----
@auth_bp.get("/users")
@login_required
@admin_required
def list_users():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT username, name, role, is_active FROM users ORDER BY is_active DESC, username"
        )
        return jsonify(cur.fetchall())

@auth_bp.post("/users")
@login_required
@admin_required
def create_user():
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["username", "password", "name", "role"])
    if err:
        return jsonify({"error": err}), 400
    if data["role"] not in ("Admin", "Staff"):
        return jsonify({"error": "role must be 'Admin' or 'Staff'"}), 400
    password_error = validate_password(data["password"])
    if password_error:
        return jsonify({"error": password_error}), 400
    if len(data["username"].strip()) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if not data["name"].strip():
        return jsonify({"error": "Display name is required"}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username=%s", (data["username"].strip(),))
        if cur.fetchone():
            return jsonify({"error": "That username already exists"}), 400
        cur.execute(
            "INSERT INTO users (username, password_hash, name, role) VALUES (%s,%s,%s,%s)",
            (data["username"].strip(), hash_password(data["password"]), data["name"].strip(), data["role"]),
        )
    conn.commit()
    return jsonify({"ok": True}), 201

@auth_bp.put("/users/<username>/username")
@login_required
@admin_required
def rename_user(username):
    # Renaming is safe: nothing else in the schema has a foreign key on the
    # username string itself (created_by/approved_by everywhere reference
    # users.id instead). The one place username is stored as text is the
    # audit log, which intentionally keeps the name as it was AT THE TIME of
    # each past action — that's correct behaviour and shouldn't change
    # retroactively just because the account is renamed today.
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["newUsername"])
    if err:
        return jsonify({"error": err}), 400
    new_username = data["newUsername"].strip()
    if len(new_username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username=%s", (username,))
        if not cur.fetchone():
            return jsonify({"error": "User not found"}), 404
        if new_username != username:
            cur.execute("SELECT id FROM users WHERE username=%s", (new_username,))
            if cur.fetchone():
                return jsonify({"error": "That username already exists"}), 400
        cur.execute("UPDATE users SET username=%s WHERE username=%s", (new_username, username))
    conn.commit()
    # Anyone signed in under the old username is naturally logged out on
    # their next request — their token's "sub" claim no longer matches any
    # row, so login_required rejects it the same way a password change does.
    return jsonify({"ok": True, "username": new_username})

@auth_bp.put("/users/<username>/password")
@login_required
@admin_required
def reset_user_password(username):
    # Admins may reset other accounts; changing their own password
    # additionally requires the current password.
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["password"])
    if err:
        return jsonify({"error": err}), 400
    password_error = validate_password(data["password"])
    if password_error:
        return jsonify({"error": password_error}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE username=%s", (username,))
        target = cur.fetchone()
        if not target:
            return jsonify({"error": "User not found"}), 404

        is_self_change = g.user.get("sub") == username
        if is_self_change:
            current_password = data.get("currentPassword") or ""
            if not current_password:
                return jsonify({"error": "Current password is required"}), 400
            if not check_password(current_password, target["password_hash"]):
                return jsonify({"error": "Current password is incorrect"}), 400

        cur.execute(
            "UPDATE users SET password_hash=%s WHERE username=%s",
            (hash_password(data["password"]), username),
        )
    conn.commit()
    return jsonify({"ok": True})

@auth_bp.put("/users/<username>/active")
@login_required
@admin_required
def set_user_active(username):
    data = request.get_json(silent=True) or {}
    if not isinstance(data.get("active"), bool):
        return jsonify({"error": "active must be true or false"}), 400
    active = data["active"]
    # Never let an Admin deactivate their own currently-logged-in account by
    # mistake and get locked out.
    if not active and username == g.user.get("sub"):
        return jsonify({"error": "You can't deactivate the account you're logged in as"}), 400
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT role FROM users WHERE username=%s", (username,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "User not found"}), 404
        # Never allow the last active Admin to be switched off — that would
        # lock everyone out with no way to turn anyone back on.
        if not active and row["role"] == "Admin":
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE role='Admin' AND is_active=1 AND username<>%s", (username,))
            if cur.fetchone()["n"] == 0:
                return jsonify({"error": "At least one active Admin account must remain"}), 400
        cur.execute("UPDATE users SET is_active=%s WHERE username=%s", (1 if active else 0, username))
    conn.commit()
    return jsonify({"ok": True})

@auth_bp.delete("/users/<username>")
@login_required
@admin_required
def delete_user(username):
    # Never let an Admin delete their own currently-logged-in account by
    # mistake and get locked out.
    if username == g.user.get("sub"):
        return jsonify({"error": "You can't remove the account you're logged in as"}), 400
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET is_active=0 WHERE username=%s", (username,))
    conn.commit()
    return jsonify({"ok": True})