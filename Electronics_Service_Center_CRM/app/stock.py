"""Inventory stock calculations shared by purchase and consumption routes."""
from decimal import Decimal


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def stock_level(cur, material, *, exclude_purchase_id=None, exclude_inventory_id=None) -> Decimal:
    """Return net on-hand stock for one material."""
    purchase_sql = """
        SELECT COALESCE(SUM(CASE WHEN type='Purchase' THEN qty ELSE -qty END), 0) AS net
        FROM purchases WHERE material=%s
    """
    purchase_params = [material]
    if exclude_purchase_id:
        purchase_sql += " AND id<>%s"
        purchase_params.append(exclude_purchase_id)
    cur.execute(purchase_sql, purchase_params)
    received = _decimal(cur.fetchone()["net"])

    inventory_sql = """
        SELECT COALESCE(SUM(CASE WHEN type='Debit' THEN qty ELSE -qty END), 0) AS net
        FROM inventory WHERE material=%s
    """
    inventory_params = [material]
    if exclude_inventory_id:
        inventory_sql += " AND id<>%s"
        inventory_params.append(exclude_inventory_id)
    cur.execute(inventory_sql, inventory_params)
    consumed = _decimal(cur.fetchone()["net"])

    return received - consumed


def purchase_contribution(transaction_type, qty) -> Decimal:
    qty = _decimal(qty)
    return qty if transaction_type == "Purchase" else -qty


def inventory_contribution(transaction_type, qty) -> Decimal:
    qty = _decimal(qty)
    return -qty if transaction_type == "Debit" else qty
