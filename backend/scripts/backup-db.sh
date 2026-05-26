#!/bin/bash
# Daily database backup script
# Add to crontab: 0 3 * * * /home/smarttech/app/smarttransfer/backend/scripts/backup-db.sh

BACKUP_DIR="/home/smarttech/backups"
DATE=$(date +%Y-%m-%d_%H%M)
RETENTION_DAYS=7

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Load DATABASE_URL from .env
source /home/smarttech/app/smarttransfer/backend/.env

# Run pg_dump
pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f "$BACKUP_DIR/smarttransfer_${DATE}.dump" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup successful: smarttransfer_${DATE}.dump"
    # Also create a plain SQL backup of just the Tenant settings (quick restore)
    psql "$DATABASE_URL" -c "SELECT settings::text FROM \"Tenant\" LIMIT 1;" -t -A > "$BACKUP_DIR/tenant_settings_${DATE}.json" 2>/dev/null
else
    echo "[$(date)] Backup FAILED!"
fi

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "smarttransfer_*.dump" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "tenant_settings_*.json" -mtime +$RETENTION_DAYS -delete
