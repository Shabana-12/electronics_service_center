# Database Structure

The fresh-install schema contains 15 tables.

| Table | Purpose |
|---|---|
| `users` | Login accounts, role and active status |
| `sequences` | Server-generated operational counters |
| `parts` | Configurable parts/material list |
| `brands` | Configurable brand list |
| `products` | Product types |
| `brackets` | Bracket/service-type list |
| `technicians` | Technician/master employee list |
| `call_statuses` | Service-ticket statuses |
| `settings` | Key/value operational settings |
| `calls` | Main service-ticket lifecycle |
| `purchases` | Parts received/returned |
| `inventory` | Parts debited/credited to service operations |
| `cashbook` | Receipt/payment ledger |
| `cash_categories` | Configurable finance categories |
| `audit_log` | Change history |

## Key relationships

- `calls.created_by`, `purchases.created_by`, `inventory.created_by`, `cashbook.created_by` -> `users.id`.
- Corresponding `approved_by` fields -> `users.id`.
- `audit_log.user_id` -> `users.id`.
- Ticket settlement voucher numbers are validated against an existing Cash Book receipt in application logic.

## Fresh installation

Use `schema.sql` for a new database. It already includes ticket images, approval/audit fields, products and settlement fields. `migrate_all.py` is the single upgrade runner for older installations; new clones should use only `schema.sql`.
