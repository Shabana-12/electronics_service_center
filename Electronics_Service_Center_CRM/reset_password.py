"""Reset a user's password from the server/CLI."""
import getpass
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.db import get_conn
from app.security import hash_password, validate_password


def reset_password(username, new_password):
    error = validate_password(new_password)
    if error:
        raise ValueError(error)
    app = create_app()
    with app.app_context():
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username=%s", (username,))
            if not cur.fetchone():
                raise ValueError(f"No user found with username '{username}'.")
            cur.execute(
                "UPDATE users SET password_hash=%s WHERE username=%s",
                (hash_password(new_password), username),
            )
        conn.commit()
    print(f"Password updated for '{username}'.")


if __name__ == "__main__":
    username = input("Username to reset: ").strip()
    password = getpass.getpass("New password (won't echo): ")
    confirm = getpass.getpass("Confirm new password: ")
    if password != confirm:
        raise SystemExit("Passwords did not match; nothing changed.")
    try:
        reset_password(username, password)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
