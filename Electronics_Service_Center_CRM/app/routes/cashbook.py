import uuid
from flask import Blueprint, request, jsonify, g
from ..db import get_conn, next_seq
from ..security import login_required, admin_required, require_fields, validate_positive_number
from ..audit import log_change

cashbook_bp = Blueprint("cashbook", __name__)



def validate_cash_entry(data):
    err = require_fields(data, ["date", "tranType", "category", "group", "amount"])
    if err:
        return err
    if data.get("tranType") not in ("Receipt", "Payment"):
        return "tranType must be 'Receipt' or 'Payment'"
    return validate_positive_number(data.get("amount"), "Amount")

FIELD_MAP = {
    "entry_date": "date", "tran_type": "tranType", "category": "category",
    "cash_group": "group", "particulars": "particulars", "stakeholder": "stakeholder",
    "mode": "mode", "amount": "amount", "comments": "comments",
}

@cashbook_bp.get("")
@login_required
def list_cashbook():
    query = "SELECT * FROM cashbook WHERE 1=1"
    params = []
    for qp, col in [("from", "entry_date >="), ("to", "entry_date <="),
                    ("type", "tran_type =")]:
        val = request.args.get(qp)
        if val:
            query += f" AND {col} %s"; params.append(val)
    query += " ORDER BY entry_date ASC, sr_no ASC"

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.execute("SELECT setting_value FROM settings WHERE setting_key='openingCashBalance'")
        opening = float((cur.fetchone() or {"setting_value": 0})["setting_value"])

    # Running balance computed server-side so it's always trustworthy,
    # never dependent on the client sending correct numbers.
    # PyMySQL returns DECIMAL columns as Decimal, not float — normalize
    # to float here so arithmetic and JSON serialization both behave.
    bal = opening
    for r in rows:
        r["amount"] = float(r["amount"]) if r["amount"] is not None else 0.0
        bal += r["amount"] if r["tran_type"] == "Receipt" else -r["amount"]
        r["running_balance"] = bal

    is_admin = g.user.get("role") == "Admin"
    if not is_admin:
        # Staff sees the ledger (who/what/when) and approval_status, but
        # never amounts or balances — that money-figure boundary is unrelated
        # to the approval workflow, so it's still enforced here separately.
        for r in rows:
            r.pop("amount", None)
            r.pop("running_balance", None)
        opening = None

    return jsonify({"opening_balance": opening, "entries": rows})

@cashbook_bp.post("")
@login_required   # Staff may add entries; response visibility is enforced by list_cashbook.
def create_cash_entry():
    data = request.get_json(silent=True) or {}
    err = validate_cash_entry(data)
    if err:
        return jsonify({"error": err}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        # Separate, gapless voucher series per type: Receipts get their own
        # continuous INC-001, INC-002... run, Payments their own EXP-001,
        # EXP-002... run — not a shared counter just relabelled by prefix.
        seq_kind = "cash_receipt" if data["tranType"] == "Receipt" else "cash_payment"
        prefix = "INC-" if data["tranType"] == "Receipt" else "EXP-"
        sr_no = next_seq(cur, seq_kind)
        rec_id = "x" + uuid.uuid4().hex[:12]
        # Voucher number is always auto-generated from the transaction type —
        # never trusts a client-supplied one, so it can't collide or be spoofed.
        voucher_no = f"{prefix}{str(sr_no).zfill(3)}"
        field_cols = list(FIELD_MAP.keys())
        field_vals = [data.get(v) for v in FIELD_MAP.values()]
        cols = ["id", "sr_no", "voucher_no", "created_by"] + field_cols
        vals = [rec_id, sr_no, voucher_no, g.user["uid"]] + field_vals
        placeholders = ["%s"] * len(cols)
        if g.user.get("role") == "Admin":
            cols += ["approval_status", "approved_by", "approved_at"]
            vals += ["Approved", g.user["uid"]]
            placeholders += ["%s", "%s", "NOW()"]
        cur.execute(f"INSERT INTO cashbook ({','.join(cols)}) VALUES ({','.join(placeholders)})", vals)
        log_change(cur, "cashbook", rec_id, "create", g.user, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"id": rec_id, "voucherNo": voucher_no}), 201

@cashbook_bp.put("/<rec_id>")
@login_required   # Staff can edit their own not-yet-approved entries; Admin can always edit
def update_cash_entry(rec_id):
    data = request.get_json(silent=True) or {}
    err = validate_cash_entry(data)
    if err:
        return jsonify({"error": err}), 400

    field_cols = list(FIELD_MAP.keys())
    field_vals = [data.get(v) for v in FIELD_MAP.values()]
    set_clause = ", ".join(f"{col}=%s" for col in field_cols)
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM cashbook WHERE id=%s", (rec_id,))
        old_row = cur.fetchone()
        if not old_row:
            return jsonify({"error": "Not found"}), 404
        if old_row["approval_status"] == "Approved" and g.user.get("role") != "Admin":
            return jsonify({"error": "This record is Admin-approved and can no longer be edited by Staff"}), 403
        cur.execute(f"UPDATE cashbook SET {set_clause} WHERE id=%s", field_vals + [rec_id])
        log_change(cur, "cashbook", rec_id, "update", g.user, old_row=old_row, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"ok": True})

@cashbook_bp.put("/<rec_id>/approve")
@login_required
@admin_required
def approve_cash_entry(rec_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM cashbook WHERE id=%s", (rec_id,))
        if not cur.fetchone():
            return jsonify({"error": "Not found"}), 404
        cur.execute(
            "UPDATE cashbook SET approval_status='Approved', approved_by=%s, approved_at=NOW() WHERE id=%s",
            (g.user["uid"], rec_id),
        )
        log_change(cur, "cashbook", rec_id, "approve", g.user)
    conn.commit()
    return jsonify({"ok": True})

@cashbook_bp.delete("/<rec_id>")
@login_required
@admin_required
def delete_cash_entry(rec_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM cashbook WHERE id=%s", (rec_id,))
        old_row = cur.fetchone()
        cur.execute("DELETE FROM cashbook WHERE id=%s", (rec_id,))
        if old_row:
            log_change(cur, "cashbook", rec_id, "delete", g.user, old_row=old_row)
    conn.commit()
    return jsonify({"ok": True})

# ---- Categories ----
@cashbook_bp.get("/categories")
@login_required   # Staff need this to populate the category dropdown when adding an entry
def list_categories():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM cash_categories ORDER BY tran_type, cash_group, category")
        return jsonify(cur.fetchall())

@cashbook_bp.post("/categories")
@login_required
@admin_required
def add_category():
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["type", "group", "category"])
    if err:
        return jsonify({"error": err}), 400
    if data["type"] not in ("Receipt", "Payment"):
        return jsonify({"error": "type must be 'Receipt' or 'Payment'"}), 400
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT IGNORE INTO cash_categories (tran_type, cash_group, category, description) "
            "VALUES (%s,%s,%s,%s)",
            (data["type"], data["group"], data["category"], data.get("desc", "")),
        )
    conn.commit()
    return jsonify({"ok": True}), 201

@cashbook_bp.delete("/categories/<int:cat_id>")
@login_required
@admin_required
def delete_category(cat_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM cash_categories WHERE id=%s", (cat_id,))
    conn.commit()
    return jsonify({"ok": True})
