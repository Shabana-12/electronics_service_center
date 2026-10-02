import json
from decimal import Decimal
import datetime


def _json_safe(value):
    """audit_log stores old/new values as JSON — DB rows can contain
    Decimal/date/datetime objects that json.dumps doesn't know how to
    serialize by default, so normalize those first."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


def log_change(cur, table_name, record_id, action, user, old_row=None, new_values=None):
    """Records one audit entry. Called right alongside the actual
    create/update/delete/approve — same transaction, same cursor, so the
    audit entry and the real change always succeed or fail together.

    old_row: the full DB row (dict) BEFORE the change — pass for update/delete.
    new_values: the fields that were actually written — pass for create/update.
    Only the fields that changed are stored for 'update' (not the whole row),
    so the change log stays readable instead of dumping every column.
    """
    old_out, new_out = None, None

    if action == "update" and old_row is not None and new_values is not None:
        changed_old, changed_new = {}, {}
        for key, new_val in new_values.items():
            old_val = old_row.get(key)
            # Normalize both sides before comparing so "same value, different
            # type" (e.g. Decimal('5.00') vs 5.0) doesn't get logged as a
            # false change.
            if _json_safe(old_val) != _json_safe(new_val):
                changed_old[key] = _json_safe(old_val)
                changed_new[key] = _json_safe(new_val)
        if not changed_new:
            return  # nothing actually changed — don't log a no-op
        old_out, new_out = changed_old, changed_new
    elif action == "create":
        new_out = {k: _json_safe(v) for k, v in (new_values or {}).items()}
    elif action == "delete":
        old_out = {k: _json_safe(v) for k, v in (old_row or {}).items()}
    elif action == "approve":
        new_out = {"approval_status": "Approved"}

    cur.execute(
        "INSERT INTO audit_log (table_name, record_id, action, user_id, username, old_values, new_values) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (
            table_name, record_id, action,
            user.get("uid"), user.get("sub"),
            json.dumps(old_out) if old_out is not None else None,
            json.dumps(new_out) if new_out is not None else None,
        ),
    )
