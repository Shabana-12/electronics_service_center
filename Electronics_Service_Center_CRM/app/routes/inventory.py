import uuid
from flask import Blueprint, request, jsonify, g
from ..db import get_conn, next_seq, pad_no
from ..security import login_required, admin_required, require_fields, validate_positive_number
from ..audit import log_change
from ..stock import stock_level, inventory_contribution

inventory_bp = Blueprint("inventory", __name__)

FIELD_MAP = {
    "entry_date": "date", "client_brand": "clientBrand", "issued_to": "issuedTo",
    "invoice_no": "invoiceNo", "material": "material", "part_code": "partCode",
    "serial_number": "serial", "size": "size", "qty": "qty", "rate": "rate",
    "type": "type", "discount": "discount", "amount": "amount",
    "linked_ticket": "linkedTicket", "comments": "comments",
}
NULLABLE_IF_BLANK = {"discount", "amount", "rate"}  # Optional DECIMAL values use NULL instead of an empty string.


def validate_inventory(data):
    err = require_fields(data, ["date", "material", "qty", "type"])
    if err:
        return err
    if data.get("type") not in ("Debit", "Credit"):
        return "type must be 'Debit' or 'Credit'"
    err = validate_positive_number(data.get("qty"), "Quantity")
    if err:
        return err
    for key, label in (("rate", "Rate"), ("discount", "Discount"), ("amount", "Amount")):
        value = data.get(key)
        if value not in (None, ""):
            err = validate_positive_number(value, label, allow_zero=True)
            if err:
                return err
    return None


def clean_values(data):
    return [(None if col in NULLABLE_IF_BLANK and data.get(key) in ("", None) else data.get(key))
            for col, key in FIELD_MAP.items()]


def stock_error_for_inventory(cur, data, record_id=None, old_material=None):
    material = data["material"]
    projected = stock_level(cur, material, exclude_inventory_id=record_id) + inventory_contribution(data["type"], data["qty"])
    if projected < 0:
        available = stock_level(cur, material, exclude_inventory_id=record_id)
        return f"Only {available} unit(s) of '{material}' are available in stock"
    if record_id and old_material and old_material != material:
        old_material_stock = stock_level(cur, old_material, exclude_inventory_id=record_id)
        if old_material_stock < 0:
            return f"This change would make '{old_material}' stock negative"
    return None

@inventory_bp.get("")
@login_required
def list_inventory():
    query = "SELECT * FROM inventory WHERE 1=1"
    params = []
    for qp, col in [("from", "entry_date >="), ("to", "entry_date <="),
                    ("who", "issued_to =")]:
        val = request.args.get(qp)
        if val:
            query += f" AND {col} %s"; params.append(val)
    query += " ORDER BY entry_date DESC, sr_no DESC LIMIT 5000"

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query, params)
        return jsonify(cur.fetchall())

@inventory_bp.post("")
@login_required
def create_inventory():
    data = request.get_json(silent=True) or {}
    err = validate_inventory(data)
    if err:
        return jsonify({"error": err}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        stock_err = stock_error_for_inventory(cur, data)
        if stock_err:
            return jsonify({"error": stock_err}), 400

        sr_no = next_seq(cur, "inventory")
        rec_id = "x" + uuid.uuid4().hex[:12]
        log_no = pad_no("INV", sr_no)
        field_cols = list(FIELD_MAP.keys())
        field_vals = clean_values(data)
        cols = ["id", "sr_no", "log_no", "created_by"] + field_cols
        vals = [rec_id, sr_no, log_no, g.user["uid"]] + field_vals
        placeholders = ["%s"] * len(cols)
        if g.user.get("role") == "Admin":
            cols += ["approval_status", "approved_by", "approved_at"]
            vals += ["Approved", g.user["uid"]]
            placeholders += ["%s", "%s", "NOW()"]
        cur.execute(f"INSERT INTO inventory ({','.join(cols)}) VALUES ({','.join(placeholders)})", vals)
        log_change(cur, "inventory", rec_id, "create", g.user, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"id": rec_id, "logNo": log_no}), 201

@inventory_bp.put("/<rec_id>")
@login_required
def update_inventory(rec_id):
    data = request.get_json(silent=True) or {}
    err = validate_inventory(data)
    if err:
        return jsonify({"error": err}), 400
    field_cols = list(FIELD_MAP.keys())
    field_vals = clean_values(data)
    set_clause = ", ".join(f"{col}=%s" for col in field_cols)
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM inventory WHERE id=%s", (rec_id,))
        old_row = cur.fetchone()
        if not old_row:
            return jsonify({"error": "Not found"}), 404
        if old_row["approval_status"] == "Approved" and g.user.get("role") != "Admin":
            return jsonify({"error": "This record is Admin-approved and can no longer be edited by Staff"}), 403
        stock_err = stock_error_for_inventory(cur, data, record_id=rec_id, old_material=old_row["material"])
        if stock_err:
            return jsonify({"error": stock_err}), 400
        cur.execute(f"UPDATE inventory SET {set_clause} WHERE id=%s", field_vals + [rec_id])
        log_change(cur, "inventory", rec_id, "update", g.user, old_row=old_row, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"ok": True})

@inventory_bp.put("/<rec_id>/approve")
@login_required
@admin_required
def approve_inventory(rec_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM inventory WHERE id=%s", (rec_id,))
        if not cur.fetchone():
            return jsonify({"error": "Not found"}), 404
        cur.execute(
            "UPDATE inventory SET approval_status='Approved', approved_by=%s, approved_at=NOW() WHERE id=%s",
            (g.user["uid"], rec_id),
        )
        log_change(cur, "inventory", rec_id, "approve", g.user)
    conn.commit()
    return jsonify({"ok": True})

@inventory_bp.delete("/<rec_id>")
@login_required
def delete_inventory(rec_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM inventory WHERE id=%s", (rec_id,))
        old_row = cur.fetchone()
        if not old_row:
            return jsonify({"error": "Not found"}), 404
        if old_row["approval_status"] == "Approved" and g.user.get("role") != "Admin":
            return jsonify({"error": "This record is Admin-approved and can no longer be deleted by Staff"}), 403
        if stock_level(cur, old_row["material"], exclude_inventory_id=rec_id) < 0:
            return jsonify({"error": "This inventory credit cannot be deleted because it is supporting current stock"}), 400
        cur.execute("DELETE FROM inventory WHERE id=%s", (rec_id,))
        if old_row:
            log_change(cur, "inventory", rec_id, "delete", g.user, old_row=old_row)
    conn.commit()
    return jsonify({"ok": True})
