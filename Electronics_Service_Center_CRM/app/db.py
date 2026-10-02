import pymysql
import pymysql.cursors
from flask import current_app, g

def get_conn():
    """One connection per request, reused via Flask's `g` and closed automatically
    in teardown_request (registered in app/__init__.py)."""
    if "db_conn" not in g:
        cfg = current_app.config
        g.db_conn = pymysql.connect(
            host=cfg["MYSQLHOST"],
            port=cfg["MYSQLPORT"],
            user=cfg["MYSQLUSER"],
            password=cfg["MYSQLPASSWORD"],
            database=cfg["MYSQLDATABASE"],
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
    return g.db_conn

def close_conn(_exc=None):
    conn = g.pop("db_conn", None)
    if conn is not None:
        conn.close()

def next_seq(cur, kind):
    """Increment and return a named sequence inside the caller's transaction."""
    cur.execute("UPDATE sequences SET value = value + 1 WHERE kind=%s", (kind,))
    cur.execute("SELECT value FROM sequences WHERE kind=%s", (kind,))
    return cur.fetchone()["value"]

def pad_no(prefix, n):
    return f"{prefix}{str(n).zfill(5)}"
