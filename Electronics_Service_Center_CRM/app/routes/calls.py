import uuid
from flask import Blueprint, request, jsonify, g
from ..db import get_conn, next_seq, pad_no
from ..security import login_required, admin_required, require_fields, validate_positive_number
from ..audit import log_change

calls_bp = Blueprint("calls", __name__)

FIELD_MAP = {
    "entry_date": "date", "ticket_number": "ticketNumber", "customer_name": "customerName",
    "mobile": "mobile", "address": "address", "product": "product", "brand": "brand", "model_number": "model",
    "serial_number": "serial", "size": "size", "date_of_purchase": "dateOfPurchase",
    "actual_issue": "actualIssue", "work_done": "workDone", "warranty": "warranty",
    "status": "status", "technician": "technician", "tech_type": "techType",
    "bracket_used": "bracketUsed", "bracket_charges": "bracketCharges",
    "call_charges": "callCharges", "defective_part_returned": "defectivePartReturned",
    "service_center_bill_amount": "billAmount", "dependency": "dependency",
    "completed_date": "completedDate", "material_cost": "materialCost",
    "before_image_url": "beforeImageUrl", "after_image_url": "afterImageUrl",
}

# DATE and DECIMAL columns reject an empty string outright ("Incorrect date
# value: ''") — MySQL wants either a real value or NULL. An empty/unfilled
# optional field on the form arrives here as "", so it has to become None
# before it ever reaches the query, for exactly these columns.
NULLABLE_IF_BLANK = {"date_of_purchase", "completed_date", "bracket_charges",
                     "call_charges", "service_center_bill_amount", "material_cost",
                     "before_image_url", "after_image_url"}

def clean_values(data):
    values = []
    for col, key in FIELD_MAP.items():
        v = data.get(key)
        if col in NULLABLE_IF_BLANK and v in ("", None):
            v = None
        values.append(v)
    return values

CLOSED_STATUSES = ("Installation Done", "Repair Done")

def business_rule_error(data):
    """Validate ticket completion, image and financial rules."""
    if data.get("status") and data.get("status") != "Pending" and not data.get("completedDate"):
        return "Completed date is required once the status is no longer Pending"
    # A job can't finish before it was even logged — this also catches an
    # accidental old date left over from a previous ticket being reused,
    # or a typo (e.g. entering last month's date by habit). Compared as
    # plain 'YYYY-MM-DD' strings, which sort chronologically exactly like
    # real dates — both fields are always in that exact format, coming
    # from a standard HTML date input, so no separate date parsing needed.
    if data.get("completedDate") and data.get("date") and data.get("completedDate") < data.get("date"):
        return "Completed date cannot be before the entry date"
    # Intake and after-service photos are optional at every other status
    # (Pending, Cancelled, and even at creation) — only mandatory the
    # moment a ticket is actually being closed. Enforced on every save
    # (create or edit), not just at creation, since status usually
    # changes later via an edit.
    if data.get("status") in CLOSED_STATUSES:
        if not data.get("beforeImageUrl"):
            return f"Invoice photo is required before marking this ticket \"{data.get('status')}\""
        if not data.get("afterImageUrl"):
            return f"after-service photo is required before marking this ticket \"{data.get('status')}\""
    for key, label in (("bracketCharges", "Bracket charges"), ("callCharges", "Call charges"),
                       ("billAmount", "Bill amount"), ("materialCost", "Material cost")):
        value = data.get(key)
        if value not in (None, ""):
            err = validate_positive_number(value, label, allow_zero=True)
            if err:
                return err
    return None

@calls_bp.get("/next-log-no")
@login_required
def next_log_no():
    # Preview the next number without consuming the sequence.
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM sequences WHERE kind='call'")
        current = cur.fetchone()["value"]
    return jsonify({"logNo": pad_no("SRV", current + 1)})

@calls_bp.get("")
@login_required
def list_calls():
    query = "SELECT * FROM calls WHERE 1=1"
    params = []
    for qp, col in [("from", "entry_date >="), ("to", "entry_date <="),
                    ("technician", "technician ="), ("status", "status =")]:
        val = request.args.get(qp)
        if val:
            query += f" AND {col} %s"; params.append(val)
    query += " ORDER BY entry_date DESC, sr_no DESC LIMIT 5000"

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    # Staff can see every ticket, including direct-customer (Warranty = No)
    # ones at any status — they need this to edit and bill them, up until
    # Admin approves it. Once Admin approves a direct-customer ticket, it's
    # locked from further Staff edits anyway, and its billing is considered
    # settled — so it's removed from Staff's view entirely from that point
    # on, rather than sitting there read-only. Admin still sees everything.
    # Money-sensitive fields stay Admin-only regardless (Source/warranty
    # label is hidden client-side; material_cost is never even sent here).
    if g.user.get("role") != "Admin":
        rows = [r for r in rows if not (r.get("warranty") == "No" and r.get("approval_status") == "Approved")]
        for r in rows:
            r.pop("material_cost", None)

    return jsonify(rows)

@calls_bp.post("")
@login_required
def create_call():
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["date", "customerName", "ticketNumber"])
    if err:
        return jsonify({"error": err}), 400
    err = business_rule_error(data)
    if err:
        return jsonify({"error": err}), 400

    # Material cost only makes sense (and is only visible) for Admin on a
    # direct-customer (Warranty = No) ticket — silently ignore it otherwise
    # so a non-admin request can never sneak a profit figure into a record.
    if g.user.get("role") != "Admin" or data.get("warranty") != "No":
        data["materialCost"] = None

    conn = get_conn()
    with conn.cursor() as cur:
        sr_no = next_seq(cur, "call")
        call_id = "x" + uuid.uuid4().hex[:12]
        log_no = pad_no("SRV", sr_no)
        field_cols = list(FIELD_MAP.keys())
        field_vals = clean_values(data)
        cols = ["id", "sr_no", "log_no", "created_by"] + field_cols
        vals = [call_id, sr_no, log_no, g.user["uid"]] + field_vals
        placeholders = ["%s"] * len(cols)
        # Admin-created records don't need Admin to separately approve their
        # own entry — the approval workflow exists to give Admin oversight
        # over what STAFF enters, not busywork on themselves. But a ticket
        # that's still Pending shouldn't be auto-approved/locked either —
        # that would block the technician from finishing it. Staff-created
        # records always start Pending approval regardless (the column's DB default).
        if g.user.get("role") == "Admin" and data.get("status") != "Pending":
            cols += ["approval_status", "approved_by", "approved_at"]
            vals += ["Approved", g.user["uid"]]
            placeholders += ["%s", "%s", "NOW()"]
        cur.execute(f"INSERT INTO calls ({','.join(cols)}) VALUES ({','.join(placeholders)})", vals)
        log_change(cur, "calls", call_id, "create", g.user, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"id": call_id, "logNo": log_no}), 201

@calls_bp.put("/<call_id>")
@login_required
def update_call(call_id):
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["date", "customerName", "ticketNumber"])
    if err:
        return jsonify({"error": err}), 400
    err = business_rule_error(data)
    if err:
        return jsonify({"error": err}), 400
    if g.user.get("role") != "Admin" or data.get("warranty") != "No":
        data["materialCost"] = None

    field_cols = list(FIELD_MAP.keys())
    field_vals = clean_values(data)
    set_clause = ", ".join(f"{col}=%s" for col in field_cols)

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM calls WHERE id=%s", (call_id,))
        old_row = cur.fetchone()
        if not old_row:
            return jsonify({"error": "Not found"}), 404
        # Approved records are immutable for Staff.
        if old_row["approval_status"] == "Approved" and g.user.get("role") != "Admin":
            return jsonify({"error": "This record is Admin-approved and can no longer be edited by Staff"}), 403
        cur.execute(f"UPDATE calls SET {set_clause} WHERE id=%s", field_vals + [call_id])
        log_change(cur, "calls", call_id, "update", g.user, old_row=old_row, new_values=dict(zip(field_cols, field_vals)))
    conn.commit()
    return jsonify({"ok": True})

@calls_bp.put("/<call_id>/approve")
@login_required
@admin_required
def approve_call(call_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id, status FROM calls WHERE id=%s", (call_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        # Approving locks the record from further Staff edits — that only
        # makes sense once the actual work is done. Approving a ticket
        # that's still Pending would lock the technician out of finishing
        # their own job.
        if row["status"] == "Pending":
            return jsonify({"error": "This ticket is still Pending — update its status once the work is done, then it can be approved"}), 400
        cur.execute(
            "UPDATE calls SET approval_status='Approved', approved_by=%s, approved_at=NOW() WHERE id=%s",
            (g.user["uid"], call_id),
        )
        log_change(cur, "calls", call_id, "approve", g.user)
    conn.commit()
    return jsonify({"ok": True})

@calls_bp.delete("/<call_id>")
@login_required
def delete_call(call_id):
    # Approved records remain protected from Staff deletion.
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM calls WHERE id=%s", (call_id,))
        old_row = cur.fetchone()
        if old_row and old_row["approval_status"] == "Approved" and g.user.get("role") != "Admin":
            return jsonify({"error": "This record is Admin-approved and can no longer be deleted by Staff"}), 403
        cur.execute("DELETE FROM calls WHERE id=%s", (call_id,))
        if old_row:
            log_change(cur, "calls", call_id, "delete", g.user, old_row=old_row)
    conn.commit()
    return jsonify({"ok": True})

@calls_bp.put("/<call_id>/settlement")
@login_required
@admin_required
def set_call_settlement(call_id):
    """Admin-only. Tags an already-Approved ticket as Unsettled / Settled /
    Rejected. 'Settled' must point at a real, existing Cash Book Receipt
    voucher — never a free-text value that could reference a voucher that
    doesn't actually exist. Kept as its own endpoint, separate from the
    normal ticket edit route, so this action can never be bundled into (or
    accidentally triggered by) an ordinary ticket save."""
    data = request.get_json(silent=True) or {}
    status = data.get("settlementStatus")
    if status not in ("Unsettled", "Settled", "Rejected"):
        return jsonify({"error": "Invalid settlement status"}), 400

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT approval_status, settlement_status, settlement_voucher_no, "
            "settlement_voucher_date, settlement_comment FROM calls WHERE id=%s",
            (call_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        if row["approval_status"] != "Approved":
            return jsonify({"error": "Only an Approved ticket can be tagged for settlement"}), 400

        voucher_no = (data.get("voucherNo") or "").strip() or None
        voucher_date = data.get("voucherDate") or None
        comment = (data.get("comment") or "").strip()[:50] or None

        if status == "Settled":
            if not voucher_no or not voucher_date:
                return jsonify({"error": "Voucher number and voucher date are required to mark as Settled"}), 400
            cur.execute(
                "SELECT id FROM cashbook WHERE voucher_no=%s AND tran_type='Receipt'",
                (voucher_no,),
            )
            if not cur.fetchone():
                return jsonify({"error": "That voucher number doesn't match an existing Receipt entry in the Cash Book"}), 400
        else:
            # Rejected or Unsettled never carry voucher details — only
            # Settled is meaningfully linked to real money received.
            voucher_no = None
            voucher_date = None
        if status == "Unsettled":
            comment = None

        old_row_full = {
            "settlement_status": row.get("settlement_status"),
            "settlement_voucher_no": row.get("settlement_voucher_no"),
            "settlement_voucher_date": row.get("settlement_voucher_date"),
            "settlement_comment": row.get("settlement_comment"),
        }
        cur.execute(
            "UPDATE calls SET settlement_status=%s, settlement_voucher_no=%s, "
            "settlement_voucher_date=%s, settlement_comment=%s WHERE id=%s",
            (status, voucher_no, voucher_date, comment, call_id),
        )
        # Reuses the existing "update" audit action (rather than inventing a
        # new action type) since log_change() already knows how to diff
        # old vs new values correctly for "update" — a new action string
        # would silently log nothing useful without also changing
        # app/audit.py, which this feature doesn't need to touch.
        log_change(
            cur, "calls", call_id, "update", g.user,
            old_row=old_row_full,
            new_values={"settlement_status": status, "settlement_voucher_no": voucher_no,
                        "settlement_voucher_date": voucher_date, "settlement_comment": comment},
        )
    conn.commit()
    return jsonify({"ok": True})