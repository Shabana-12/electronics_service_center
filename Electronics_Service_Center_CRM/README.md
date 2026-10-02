# Electronics Service Center CRM

A portfolio-ready service-operations CRM built with **Python, Flask, MySQL and vanilla JavaScript**. The application manages electronics service tickets, purchases, inventory consumption, cash-book entries, approvals, settlements, audit history and operational reports.

## Why this project exists

This project demonstrates end-to-end backend ownership rather than a UI-only CRUD demo. The Flask application exposes authenticated REST endpoints, enforces role and business rules on the server, persists data in MySQL, records audit history, supports optional S3 image uploads, and includes production deployment assets for Nginx, Gunicorn and systemd.

## Core capabilities

- JWT authentication with bcrypt password hashing and immediate token invalidation after password changes.
- Admin/Staff authorization enforced in Flask routes.
- Service-ticket lifecycle with SLA/KPI reporting, billing and settlement tracking.
- Purchase ledger and inventory consumption with server-side stock validation.
- Cash book with independent receipt/payment voucher sequences and Admin-only financial visibility.
- Approval workflow that locks Staff edits after Admin approval.
- Audit log for create, update, approve and delete actions.
- MySQL-backed configurable master lists and settings.
- Optional AWS S3 ticket-image uploads with size/type checks.
- Excel exports, printable bills/statements and Chart.js dashboard reporting.
- Gunicorn + Nginx + systemd deployment configuration for AWS EC2.
- End-to-end pytest suite that runs against a real application instance and database.

## Technology

**Backend:** Python 3, Flask, PyMySQL, PyJWT, bcrypt, Flask-Limiter, Flask-CORS  
**Database:** MySQL 8  
**Frontend:** Jinja2, HTML, CSS, vanilla JavaScript, Chart.js, SheetJS  
**Cloud/deployment:** AWS EC2, optional S3, Nginx, Gunicorn, systemd

## Project structure

```text
app/
  routes/              Flask REST endpoints grouped by domain
  static/css/          application styling
  static/js/api.js         API client and server-to-UI data adapters
  static/js/common.js      shared auth, formatting, pagination and record actions
  static/js/calls.js       service-ticket UI and settlement
  static/js/purchases.js   purchase ledger UI
  static/js/inventory.js   inventory and stock-aware forms
  static/js/finance.js     cash book and income/expenditure
  static/js/dashboard.js   dashboard KPIs and stock summaries
  static/js/settings.js    Admin settings and user/master-data management
  static/js/reports.js     reports, exports, bills and technician statements
  static/js/init.js        page startup and event wiring
  templates/           Jinja pages and modal/section partials
  security.py          authentication, authorization and validation helpers
  db.py                MySQL connection and sequence helpers
  audit.py             audit-log diff/serialization helpers
  stock.py             shared stock-integrity calculations
  s3_utils.py          S3 upload support

deploy/                EC2/systemd/Nginx/backup configuration
tests/                 end-to-end API tests
docs/                  architecture, database and recruiter notes
schema.sql              authoritative fresh-install schema
migrate_all.py          idempotent upgrade path for older databases
```

### Where to make a change

The frontend is intentionally grouped by business feature rather than kept in one large file. Common examples:

- Service ticket field/status change → `app/static/js/calls.js` + `app/routes/calls.py`
- Purchase change → `app/static/js/purchases.js` + `app/routes/purchases.py`
- Stock/inventory rule → `app/static/js/inventory.js` + `app/routes/inventory.py` / `app/stock.py`
- Cash-book change → `app/static/js/finance.js` + `app/routes/cashbook.py`
- Dashboard KPI → `app/static/js/dashboard.js`
- Admin Settings/User Management → `app/static/js/settings.js` + relevant Flask route
- Login/role/menu/shared behavior → `app/static/js/common.js` + `app/templates/base.html`
- Page-load/event wiring → `app/static/js/init.js`

See `docs/PROJECT_MAP.md` for the full change map.

## Local setup

1. Create a virtual environment and install dependencies.

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
```

2. Create the database using `schema.sql`.

```bash
mysql -u root -p < schema.sql
```

3. Create a least-privilege application user in MySQL.

```sql
CREATE USER 'esc_app'@'localhost' IDENTIFIED BY 'use-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON electronics_service_crm.* TO 'esc_app'@'localhost';
FLUSH PRIVILEGES;
```

4. Copy `.env.example` to `.env` and set your local values. Generate the JWT secret with:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

5. Load safe demo master data and create the first Admin account.

```bash
python seed_lists.py
python seed_cash_categories.py
python seed_users.py
```

6. Start the application.

```bash
python run.py
```

Open `http://127.0.0.1:5000`.

## Existing database upgrade

A fresh clone should use `schema.sql`. If upgrading an older database, run:

```bash
python migrate_all.py
```

The migration runner is idempotent and checks historical schema additions before applying them. Run upgrades with a database account that has the required DDL privileges (`ALTER`, `CREATE`, `INDEX`); keep the normal runtime `esc_app` account limited to application DML.

## Tests

The current test suite is end-to-end: it talks to a real running Flask server and MySQL database. See `tests/README.md` for setup.

```bash
pip install -r requirements-test.txt
# set CRM_ADMIN_PASS and optionally CRM_ADMIN_USER / CRM_BASE_URL
pytest -q
```

## Deployment

`AWS_DEPLOY.md` contains the EC2 deployment walkthrough. Production assets under `deploy/` use Nginx as the reverse proxy, Gunicorn as the WSGI server and systemd for process management. Do not commit `.env`, database dumps, real customer images or credentials.

## Public demo guidance

Never publish an Admin password in GitHub or on a resume. If a live portfolio demo is exposed publicly, use a separate sanitized database with disposable sample data and a dedicated Staff account. Rotate the demo password periodically and keep S3/demo resources isolated from any real system.

## Documentation

- `docs/ARCHITECTURE.md` — request flow and backend design decisions.
- `docs/DATABASE.md` — table structure and relationships.
- `docs/RECRUITER_GUIDE.md` — concise explanation for interviews and resume discussions.
- `docs/PORTFOLIO_CHANGES.md` — what was changed to prepare the public repository and why.
- `docs/DEMO_CHECKLIST.md` — safe live-demo preparation and credential guidance.
- `docs/S3_SETUP.md` — optional demo image-storage setup and privacy guidance.

## License / data note

The repository contains only generic demo branding and sanitized seed data. Replace demo content with your own authorized data before using the application for a real service center.
