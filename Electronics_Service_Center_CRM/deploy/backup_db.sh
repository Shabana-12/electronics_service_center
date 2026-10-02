#!/usr/bin/env bash
# Daily MySQL backup. Reads database credentials from the project .env file.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/electronics-service-crm}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
mkdir -p "$BACKUP_DIR"

set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a

STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/electronics_service_crm_${STAMP}.sql.gz"

MYSQL_PWD="$MYSQLPASSWORD" mysqldump \
  --host="$MYSQLHOST" --port="${MYSQLPORT:-3306}" --user="$MYSQLUSER" \
  --single-transaction --skip-lock-tables --no-tablespaces \
  "$MYSQLDATABASE" | gzip > "$FILE"

echo "$(date): backup created at $FILE"

if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  aws s3 cp "$FILE" "s3://${S3_BACKUP_BUCKET}/backups/$(basename "$FILE")"
  echo "$(date): backup uploaded to S3"
fi

find "$BACKUP_DIR" -name 'electronics_service_crm_*.sql.gz' -mtime +14 -delete
