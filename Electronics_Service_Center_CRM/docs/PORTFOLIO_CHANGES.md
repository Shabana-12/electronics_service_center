# Public Portfolio Preparation

## Branding and privacy

- Renamed the public project to **Electronics Service Center CRM**.
- Removed the original company name, location, phone number, logo and signature image.
- Replaced technician and inventory seed data with generic demo content.
- Replaced image-based branding with a lightweight ESC interface mark and neutral favicon.

**Why:** a public portfolio should demonstrate engineering work without exposing client/company identity, personal data or signatures.

## Frontend

- Refreshed the login screen, sidebar, cards, buttons and application colors while retaining every existing page and workflow.
- Kept Jinja, HTML/CSS and vanilla JavaScript; no React/Django/frontend framework conversion.
- Removed the obsolete in-browser demo users and seed state.
- Kept `static/js/api.js` for API/data adapters and split the former large UI script into small feature files: `common.js`, `calls.js`, `purchases.js`, `inventory.js`, `finance.js`, `dashboard.js`, `settings.js`, `reports.js` and `init.js`.

**Why:** the interface looks portfolio-ready while the technology choice stays aligned with a backend Python project. Feature-based JavaScript also makes live maintenance easier: a ticket, stock, cash-book or settings change has an obvious file instead of requiring a search through one large script.

## Backend and security

- Added reusable positive/non-negative numeric validation.
- Strengthened newly created/reset passwords to at least eight characters with letters and numbers.
- Added server-side enum validation for purchase, inventory and cash-book transaction types.
- Centralized stock calculations in `app/stock.py` and protected purchase/inventory create, update and delete paths from producing negative stock.
- Kept JWT, bcrypt, rate limiting, parameterized SQL, role checks and password-change token invalidation.

**Why:** public code should demonstrate that business rules are enforced at the API boundary, not only by HTML input attributes.

## Database

- Made `schema.sql` the authoritative fresh-install schema.
- Renamed the fresh database to `electronics_service_crm`.
- Added the existing settlement fields/index to the main schema so a new install no longer requires a separate migration to match the code.
- Updated `migrate_all.py` to cover product, call-image and settlement additions used by historical databases.

**Why:** a recruiter should be able to clone the repository and create the correct database from one schema.

## Tests and documentation

- Updated stale permission tests to match the current Staff Cash Book behavior: Staff can view operational rows, but amounts and balances are omitted.
- Updated photo tests to match the current rule: photos are optional while Pending and mandatory when closing a ticket.
- Added an inventory-update stock regression test and aligned stale API tests with the current route contracts.
- Removed hard-coded original Admin usernames from tests.
- Rewrote project/testing/deployment documentation in developer-facing language.

## Deployment

- Renamed systemd/service paths to `electronics-service-crm`.
- Added `.env.example`.
- Updated deployment guidance toward a dedicated least-privilege MySQL application user instead of using the database root account.
- Added an EC2 bootstrap script that generates database/JWT secrets locally, loads sanitized seeds and installs systemd/Nginx configuration.
- Restricted the Settings management screen to Admin users: Staff no longer sees the navigation item and direct page access redirects to Dashboard, while read-only operational setting values remain available where Staff workflows require them.
