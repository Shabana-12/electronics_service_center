from flask import Blueprint, request, jsonify
from ..db import get_conn
from ..security import login_required, admin_required, require_fields

lists_bp = Blueprint("lists", __name__)

# Each list type maps to its own real, properly-named table — never built
# from user input, so this is safe to use directly in SQL below.
TABLES = {
    "parts": "parts",
    "brands": "brands",
    "brackets": "brackets",
    "employees": "technicians",
    "statuses": "call_statuses",
    "products": "products",
}

@lists_bp.get("/<list_type>")
@login_required
def get_list(list_type):
    table = TABLES.get(list_type)
    if not table:
        return jsonify({"error": "Unknown list type"}), 404
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(f"SELECT name FROM {table} ORDER BY name")
        return jsonify([r["name"] for r in cur.fetchall()])

@lists_bp.post("/<list_type>")
@login_required
@admin_required
def add_list_value(list_type):
    table = TABLES.get(list_type)
    if not table:
        return jsonify({"error": "Unknown list type"}), 404
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["value"])
    if err:
        return jsonify({"error": err}), 400
    value = data["value"].strip()
    if not value:
        return jsonify({"error": "value cannot be blank"}), 400
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(f"INSERT IGNORE INTO {table} (name) VALUES (%s)", (value,))
    conn.commit()
    return jsonify({"ok": True}), 201

@lists_bp.delete("/<list_type>/<path:value>")
@login_required
@admin_required
def delete_list_value(list_type, value):
    table = TABLES.get(list_type)
    if not table:
        return jsonify({"error": "Unknown list type"}), 404
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table} WHERE name=%s", (value,))
    conn.commit()
    return jsonify({"ok": True})
