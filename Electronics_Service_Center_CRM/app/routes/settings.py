from flask import Blueprint, request, jsonify
from ..db import get_conn
from ..security import login_required, admin_required, require_fields

settings_bp = Blueprint("settings", __name__)

@settings_bp.get("")
@login_required
def get_settings():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT setting_key, setting_value FROM settings")
        return jsonify({r["setting_key"]: r["setting_value"] for r in cur.fetchall()})

@settings_bp.put("/<key>")
@login_required
@admin_required
def update_setting(key):
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["value"])
    if err:
        return jsonify({"error": err}), 400
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO settings (setting_key, setting_value) VALUES (%s,%s) "
            "ON DUPLICATE KEY UPDATE setting_value=%s",
            (key, str(data["value"]), str(data["value"])),
        )
    conn.commit()
    return jsonify({"ok": True})
