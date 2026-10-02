"""Create the first Admin user with a bcrypt-hashed password."""
import getpass
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.db import get_conn
from app.security import hash_password, validate_password


def add_user(username, password, name, role):
    error = validate_password(password)
    if error:
        raise ValueError(error)
    app = create_app()
    with app.app_context():
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username=%s", (username,))
            if cur.fetchone():
                raise ValueError("That username already exists")
            cur.execute(
                "INSERT INTO users (username, password_hash, name, role) VALUES (%s,%s,%s,%s)",
                (username, hash_password(password), name, role),
            )
        conn.commit()
    print(f"Created {role} user '{username}'")


if __name__ == "__main__":
    print("Create the first Admin user:")
    username = input("  username: ").strip()
    password = getpass.getpass("  password (won't echo): ")
    name = input("  display name: ").strip()
    if len(username) < 3 or not name:
        raise SystemExit("Username must be at least 3 characters and display name is required.")
    try:
        add_user(username, password, name, "Admin")
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
