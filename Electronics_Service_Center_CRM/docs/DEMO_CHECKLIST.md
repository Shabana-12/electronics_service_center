# Public Demo Checklist

Use a completely separate demo database and AWS resources. Never copy production/customer data into the portfolio environment.

## Before sharing the link

1. Create the database from `schema.sql` and load the sanitized master seeds.
2. Create your private Admin account with `python seed_users.py`.
3. From Settings, create a dedicated `Staff` account for recruiter/demo access. Use a strong rotating password.
4. Add a small set of fictional records: one Pending ticket, one completed warranty ticket, one direct-customer ticket, a purchase, an inventory issue and a Cash Book receipt/payment.
5. Use only generic/fake names, mobile numbers and images. Keep the demo S3 bucket separate from any real bucket.
6. Enable HTTPS before sharing credentials and set `FLASK_ENV=production` plus the exact HTTPS URL in `ALLOWED_ORIGINS`.
7. Test the demo in an incognito browser as the Staff user. Confirm financial/admin-only data stays hidden.

## What to put on the resume

Prefer two links: **GitHub** for the source and **Live Demo** for the deployed application. Do not publish the Admin password. A disposable Staff credential can be listed in the README only if you are comfortable rotating it and resetting demo data; otherwise write “Demo credentials available on request.”
