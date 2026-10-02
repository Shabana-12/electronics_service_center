#!/usr/bin/env bash
# Bootstrap a fresh Ubuntu EC2 instance for Electronics Service Center CRM.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/electronics-service-crm}"
cd "$APP_DIR"

echo "==> Installing system packages"
sudo apt update
sudo apt install -y python3-venv python3-pip mysql-server nginx git curl

echo "==> Creating Python environment"
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
mkdir -p logs backups

echo "==> Creating database schema"
sudo mysql < schema.sql

echo "==> Creating least-privilege application database account"
APP_DB_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
sudo mysql <<SQL
CREATE USER IF NOT EXISTS 'esc_app'@'localhost' IDENTIFIED BY '${APP_DB_PASSWORD}';
ALTER USER 'esc_app'@'localhost' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON electronics_service_crm.* TO 'esc_app'@'localhost';
FLUSH PRIVILEGES;
SQL

if [ ! -f .env ]; then
  cp .env.example .env
fi
JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
python3 - <<PY
from pathlib import Path
p = Path('.env')
s = p.read_text()
replacements = {
    'MYSQLHOST=127.0.0.1': 'MYSQLHOST=127.0.0.1',
    'MYSQLUSER=esc_app': 'MYSQLUSER=esc_app',
    'MYSQLPASSWORD=change-this-password': 'MYSQLPASSWORD=${APP_DB_PASSWORD}',
    'MYSQLDATABASE=electronics_service_crm': 'MYSQLDATABASE=electronics_service_crm',
    'JWT_SECRET=replace-with-a-long-random-value': 'JWT_SECRET=${JWT_SECRET}',
    'FLASK_ENV=development': 'FLASK_ENV=production',
}
for old, new in replacements.items():
    s = s.replace(old, new)
p.write_text(s)
PY
chmod 600 .env

echo "==> Configure your public URL before starting"
PUBLIC_IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
python3 - <<PY
from pathlib import Path
p = Path('.env')
s = p.read_text()
s = s.replace('ALLOWED_ORIGINS=http://127.0.0.1:5000,http://localhost:5000', 'ALLOWED_ORIGINS=http://${PUBLIC_IP}')
p.write_text(s)
PY

echo "==> Loading sanitized master data"
python seed_lists.py
python seed_cash_categories.py

echo "==> Create the first Admin account"
python seed_users.py

echo "==> Installing systemd service"
sudo cp deploy/electronics-service-crm.service /etc/systemd/system/electronics-service-crm.service
sudo systemctl daemon-reload
sudo systemctl enable --now electronics-service-crm

echo "==> Configuring Nginx"
sudo sed "s/YOUR_DOMAIN_OR_IP/${PUBLIC_IP}/" deploy/nginx.conf | \
  sudo tee /etc/nginx/sites-available/electronics-service-crm >/dev/null
sudo ln -sf /etc/nginx/sites-available/electronics-service-crm /etc/nginx/sites-enabled/electronics-service-crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo
echo "Deployment complete: http://${PUBLIC_IP}"
echo "DB password and JWT secret were generated and stored only in .env (chmod 600)."
echo "Next: add HTTPS with Certbot before sharing a public login."
echo "Logs: sudo journalctl -u electronics-service-crm -f"
