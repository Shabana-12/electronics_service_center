"""Load sanitized master-list demo data into the configured database.

Usage:
    python seed_lists.py
"""
import json
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.db import get_conn

TABLES = {
    "parts": "parts",
    "brands": "brands",
    "brackets": "brackets",
    "employees": "technicians",
    "statuses": "call_statuses",
    "products": "products",
}

def main():
    with open("lists_seed.json", encoding="utf-8") as f:
        data = json.load(f)

    app = create_app()
    with app.app_context():
        conn = get_conn()
        with conn.cursor() as cur:
            total = 0
            for list_type, values in data.items():
                table = TABLES[list_type]
                for v in values:
                    cur.execute(f"INSERT IGNORE INTO {table} (name) VALUES (%s)", (v,))
                    total += 1
        conn.commit()
    print(f"Loaded {total} list values across {len(data)} tables")

if __name__ == "__main__":
    main()
