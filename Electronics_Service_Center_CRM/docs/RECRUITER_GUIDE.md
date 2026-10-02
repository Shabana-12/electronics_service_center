# Recruiter / Interview Explanation

## 30-second version

> I built an Electronics Service Center CRM using Python, Flask and MySQL. It manages the full service lifecycle: tickets, purchases, inventory consumption, cash-book entries, approvals, settlements and reports. I designed the REST APIs and database, added JWT/bcrypt authentication, server-side role checks, inventory validation and audit logging, and prepared the application for AWS EC2 deployment with Nginx, Gunicorn and systemd. The frontend uses Jinja, HTML/CSS and vanilla JavaScript because my focus was delivering a complete backend-driven system without adding an unnecessary frontend framework.

## What to show in a demo

1. Sign in and explain Admin vs Staff authorization, including that Settings management is available only to Admin.
2. Create or open a service ticket and show the lifecycle fields.
3. Show Purchase Ledger -> Inventory and explain the stock guard.
4. Show how Admin approval locks Staff edits.
5. Show Cash Book and explain that Staff responses do not include financial amounts.
6. Show the audit log and explain traceability.
7. Show SLA/KPI or dashboard reporting.
8. Open the repository structure and briefly show Flask blueprints, the feature-based JavaScript files, `security.py`, `schema.sql`, tests and deployment assets. `docs/PROJECT_MAP.md` shows exactly where common changes belong.

## Backend decisions worth discussing

- Parameterized SQL rather than string-interpolated user values.
- Password hashes are bcrypt; plaintext passwords are never stored.
- Authentication/authorization is enforced server-side, not only by hidden buttons.
- Password changes invalidate old JWTs using a password-hash fingerprint.
- Stock integrity is centralized and validated across purchase/inventory create, update and delete operations.
- Audit history captures who changed operational records and what changed.
- Generated sequence/voucher values come from the server, not from client input.
- S3 uploads are optional so local development still works without AWS credentials.
- Nginx handles HTTP(S), Gunicorn serves Flask, and systemd manages the application process.

## Resume wording

**Electronics Service Center CRM | Python, Flask, MySQL, AWS**  
Built a role-based service-operations CRM covering service tickets, purchases, inventory consumption, cash-book tracking, approval/settlement workflows, audit logging, SLA/KPI reporting and Excel exports. Implemented JWT/bcrypt authentication, server-side authorization and validation, optional S3 image uploads, and production deployment assets for AWS EC2 using Nginx, Gunicorn and systemd.

## Live demo credentials

Do not publish an Admin password. For a public demo, use an isolated demo database and a dedicated Staff account with disposable sample data. A GitHub README can state that demo credentials are available on request, or list a rotating Staff-only demo credential if the environment is intentionally disposable.


## Deployment architecture in one sentence

> Nginx receives HTTP/HTTPS traffic and proxies application requests to Gunicorn, Gunicorn runs the Flask app, Flask reads/writes MySQL and optionally S3, and systemd keeps the Gunicorn service running across crashes or EC2 reboots.
