# AWS EC2 Deployment

This deployment uses **Ubuntu + Nginx + Gunicorn + systemd + MySQL**. S3 is optional for ticket images.

## 1. Create the EC2 instance

Use a current Ubuntu LTS AMI. Allow SSH (22) only from your IP, and HTTP/HTTPS (80/443) from the internet. Attach an IAM role for S3 instead of storing AWS access keys on the instance if image uploads/backups are enabled.

## 2. Upload or clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/electronics-service-center-crm.git electronics-service-crm
cd electronics-service-crm
```

## 3. Install system packages

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nginx mysql-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
mkdir -p logs backups
```

## 4. Create MySQL database and app user

```bash
sudo mysql
```

```sql
SOURCE /home/ubuntu/electronics-service-crm/schema.sql;
CREATE USER 'esc_app'@'localhost' IDENTIFIED BY 'USE_A_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON electronics_service_crm.* TO 'esc_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`schema.sql` is intended for a fresh install. Use `python migrate_all.py` only when upgrading an older database.

## 5. Configure environment

```bash
cp .env.example .env
nano .env
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Use `MYSQLUSER=esc_app`, the strong password created above, `MYSQLDATABASE=electronics_service_crm`, a fresh JWT secret, and your real HTTPS origin in `ALLOWED_ORIGINS`.

Load demo/master data and create the first Admin interactively:

```bash
source venv/bin/activate
python seed_lists.py
python seed_cash_categories.py
python seed_users.py
```

## 6. Install the systemd service

```bash
sudo cp deploy/electronics-service-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now electronics-service-crm
sudo systemctl status electronics-service-crm
```

## 7. Configure Nginx

Update `YOUR_DOMAIN_OR_IP` in `deploy/nginx.conf` or use the setup script, then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/electronics-service-crm
sudo ln -sf /etc/nginx/sites-available/electronics-service-crm /etc/nginx/sites-enabled/electronics-service-crm
sudo nginx -t
sudo systemctl reload nginx
```

For a domain, add TLS with Certbot and set `FLASK_ENV=production` plus the HTTPS origin in `ALLOWED_ORIGINS`.

## 8. Useful commands

```bash
sudo systemctl restart electronics-service-crm
sudo systemctl status electronics-service-crm
sudo journalctl -u electronics-service-crm -f
```

## Security checklist

- Never commit `.env`, SQL backups, credentials or real customer images.
- Never run the application with the MySQL root account.
- Keep SSH restricted to your IP and use key-based authentication.
- Use HTTPS before exposing login credentials publicly.
- For a portfolio demo, use only sanitized sample data and never publish an Admin password.
