"""Load sanitized Cash Book categories into the configured database.

Usage:
    python seed_cash_categories.py
"""
import json
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.db import get_conn

def main():
    with open("cash_categories_seed.json", encoding="utf-8") as f:
        categories = json.load(f)

    app = create_app()
    with app.app_context():
        conn = get_conn()
        with conn.cursor() as cur:
            for c in categories:
                cur.execute(
                    "INSERT IGNORE INTO cash_categories (tran_type, cash_group, category, description) "
                    "VALUES (%s,%s,%s,%s)",
                    (c["type"], c["group"], c["category"], c.get("desc", "")),
                )
        conn.commit()
    print(f"Loaded {len(categories)} cash book categories")

if __name__ == "__main__":
    main()
