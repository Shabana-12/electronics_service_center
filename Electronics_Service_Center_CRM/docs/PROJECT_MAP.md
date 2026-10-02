# Project Change Map

Use this as the fastest way to find where a change belongs.

| Requested change | Frontend | Backend / data |
|---|---|---|
| Login/session/role UI | `app/static/js/common.js` | `app/routes/auth.py`, `app/security.py` |
| Sidebar/menu visibility | `app/templates/base.html`, `common.js` | page/API authorization route |
| Service call fields/status/billing | `app/static/js/calls.js` | `app/routes/calls.py` |
| Purchase entry | `app/static/js/purchases.js` | `app/routes/purchases.py` |
| Inventory/stock | `app/static/js/inventory.js` | `app/routes/inventory.py`, `app/stock.py` |
| Cash book | `app/static/js/finance.js` | `app/routes/cashbook.py` |
| Dashboard KPI/card/chart | `app/static/js/dashboard.js` | usually existing API data |
| Settings/users/master lists | `app/static/js/settings.js` | `app/routes/settings.py`, `app/routes/lists.py`, `app/routes/auth.py` |
| SLA/report/export/bill | `app/static/js/reports.js` | related API route/data |
| API field mapping/loading | `app/static/js/api.js` | relevant Flask route |
| Page initialization/events | `app/static/js/init.js` | — |
| Database tables | — | `schema.sql` |
| DB connection | — | `app/db.py`, `.env` |
| S3 uploads | calls UI | `app/s3_utils.py`, `app/routes/uploads.py` |
| Deployment | — | `deploy/`, `AWS_DEPLOY.md` |

## Simple rule

For a business feature, start with the file named after that feature. Keep reusable business rules on the backend (`stock.py`, `security.py`) instead of duplicating them in multiple UI files.

Example: if Staff must not access Settings, hide/redirect the UI in `base.html`/`common.js` **and** keep the settings update API Admin-only. UI visibility is convenience; backend authorization is security.
