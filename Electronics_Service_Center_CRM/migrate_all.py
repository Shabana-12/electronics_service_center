"""Idempotently upgrade an older Electronics Service Center CRM database."""
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.db import get_conn


def column_exists(cur, table, column):
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND COLUMN_NAME=%s",
        (table, column),
    )
    return cur.fetchone()["n"] > 0


def table_exists(cur, table):
    cur.execute("SHOW TABLES LIKE %s", (table,))
    return cur.fetchone() is not None


def index_exists(cur, table, index_name):
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND INDEX_NAME=%s",
        (table, index_name),
    )
    return cur.fetchone()["n"] > 0


def migrate_master_lists(cur):
    mapping = {
        "parts": "parts",
        "brands": "brands",
        "products": "products",
        "brackets": "brackets",
        "employees": "technicians",
        "statuses": "call_statuses",
    }
    for table in sorted(set(mapping.values())):
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(191) NOT NULL UNIQUE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
            """
        )

    if table_exists(cur, "lists"):
        for list_type, table in mapping.items():
            cur.execute("SELECT value FROM lists WHERE list_type=%s", (list_type,))
            for row in cur.fetchall():
                cur.execute(f"INSERT IGNORE INTO {table} (name) VALUES (%s)", (row["value"],))
        cur.execute("DROP TABLE lists")
        print("[done] migrated shared lists into domain tables")
    else:
        print("[skip] shared lists table not present")


def migrate_call_fields(cur):
    fields = [
        ("product", "VARCHAR(128) AFTER address"),
        ("material_cost", "DECIMAL(10,2) AFTER completed_date"),
        ("before_image_url", "VARCHAR(500)"),
        ("after_image_url", "VARCHAR(500)"),
        ("settlement_status", "ENUM('Unsettled','Settled','Rejected') NOT NULL DEFAULT 'Unsettled'"),
        ("settlement_voucher_no", "VARCHAR(32)"),
        ("settlement_voucher_date", "DATE"),
        ("settlement_comment", "VARCHAR(50)"),
    ]
    for name, ddl in fields:
        if column_exists(cur, "calls", name):
            print(f"[skip] calls.{name}")
        else:
            cur.execute(f"ALTER TABLE calls ADD COLUMN {name} {ddl}")
            print(f"[done] calls.{name}")

    if not index_exists(cur, "calls", "idx_calls_settlement"):
        cur.execute("CREATE INDEX idx_calls_settlement ON calls (settlement_status)")
        print("[done] idx_calls_settlement")


def migrate_approval_and_audit(cur):
    for table in ("calls", "purchases", "inventory", "cashbook"):
        if not column_exists(cur, table, "approval_status"):
            cur.execute(
                f"""
                ALTER TABLE {table}
                ADD COLUMN approval_status ENUM('Pending','Approved') NOT NULL DEFAULT 'Pending',
                ADD COLUMN approved_by INT NULL,
                ADD COLUMN approved_at DATETIME NULL,
                ADD INDEX idx_{table}_approval (approval_status),
                ADD CONSTRAINT fk_{table}_approved_by
                    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
                """
            )
            print(f"[done] approval fields on {table}")
        else:
            print(f"[skip] approval fields on {table}")

    if not table_exists(cur, "audit_log"):
        cur.execute(
            """
            CREATE TABLE audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_name VARCHAR(32) NOT NULL,
                record_id VARCHAR(32) NOT NULL,
                action ENUM('create','update','delete','approve') NOT NULL,
                user_id INT,
                username VARCHAR(64),
                changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                old_values JSON,
                new_values JSON,
                INDEX idx_audit_table_record (table_name, record_id),
                INDEX idx_audit_changed_at (changed_at),
                CONSTRAINT fk_audit_user FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
            """
        )
        print("[done] audit_log")
    else:
        print("[skip] audit_log")

    cur.execute("SELECT kind FROM sequences WHERE kind IN ('cash_receipt','cash_payment')")
    existing = {row["kind"] for row in cur.fetchall()}
    for kind in ("cash_receipt", "cash_payment"):
        if kind not in existing:
            cur.execute("INSERT INTO sequences (kind, value) VALUES (%s, 0)", (kind,))
            print(f"[done] sequence {kind}")


def main():
    app = create_app()
    with app.app_context():
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                migrate_master_lists(cur)
                migrate_call_fields(cur)
                migrate_approval_and_audit(cur)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    print("Database migration complete.")


if __name__ == "__main__":
    main()
