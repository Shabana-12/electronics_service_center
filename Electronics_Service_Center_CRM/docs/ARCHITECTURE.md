# Architecture

## Request flow

```text
Browser (Jinja + vanilla JS)
        |
        | HTTPS / JSON
        v
Nginx reverse proxy
        |
        v
Gunicorn
        |
        v
Flask application
  |-- JWT / role checks
  |-- input + business-rule validation
  |-- domain blueprints
  |-- audit logging
  |-- optional S3 uploads
        |
        v
MySQL
```

## Backend organization

The Flask application is split into blueprints by domain: authentication, calls, purchases, inventory, cash book, lists, settings, uploads and audit history. Routes use parameterized PyMySQL queries and one request-scoped database connection.

Authentication uses bcrypt password hashes and JWT access tokens. A short fingerprint of the current password hash is stored in each token and checked on authenticated requests, so changing a user's password invalidates previously issued tokens immediately.

The approval workflow is enforced server-side. Staff can create and work with operational records, but approved records are locked from Staff mutation. Financial figures are stripped from Staff cash-book responses instead of relying only on UI hiding.

The Settings management screen is Admin-only. Staff accounts do not see the Settings navigation item and direct navigation to `/settings` is redirected to the Dashboard. Staff can still read the small set of operational setting values required by SLA and cash-book calculations; all setting updates remain protected by the Admin authorization decorator.

Stock calculation is centralized in `app/stock.py`. Purchase/return and inventory debit/credit operations are checked on create, update and delete so ledger edits cannot leave a material with negative stock.

Audit entries store the affected table, record, action, user and changed values. This provides traceability without coupling audit history to frontend state.

## Frontend organization

The frontend stays intentionally lightweight: server-rendered Jinja pages plus vanilla JavaScript. JavaScript is grouped by the business area a developer would naturally search for:

```text
api.js         HTTP client + API/data mapping
common.js      auth, shared formatting, pagination, shared record actions
calls.js       service tickets + settlement
purchases.js   purchase ledger
inventory.js   consumption/inventory forms
finance.js     cash book + income/expenditure
dashboard.js   dashboard KPIs and stock summaries
settings.js    Admin settings/users/master lists
reports.js     SLA/reports/exports/bills/statements
init.js        page bootstrap + event listeners
```

This is deliberately not a framework-heavy frontend. The goal is a maintainable UI layer around a Flask backend, with one obvious place to start for most requested changes.

