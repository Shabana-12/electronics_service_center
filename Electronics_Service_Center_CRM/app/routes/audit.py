from flask import Blueprint, request, jsonify
from ..db import get_conn
from ..security import login_required, admin_required

audit_bp = Blueprint("audit", __name__)

@audit_bp.get("")
@login_required
@admin_required   # who-changed-what is oversight data — Admin only
def list_audit_log():
    query = "SELECT * FROM audit_log WHERE 1=1"
    params = []
    for qp, col in [("from", "changed_at >="), ("to", "changed_at <="),
                    ("table", "table_name ="), ("action", "action ="),
                    ("user", "username =")]:
        val = request.args.get(qp)
        if val:
            query += f" AND {col} %s"; params.append(val)
    query += " ORDER BY changed_at DESC LIMIT 5000"

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    # old_values/new_values come back as JSON text from MySQL — the
    # frontend wants them as real objects, not strings to parse itself.
    import json
    for r in rows:
        for key in ("old_values", "new_values"):
            if r.get(key):
                try:
                    r[key] = json.loads(r[key])
                except (TypeError, ValueError):
                    pass
    return jsonify(rows)
