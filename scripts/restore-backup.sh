#!/usr/bin/env bash
# Restore an encrypted nightly backup made by .github/workflows/db-backup.yml.
#
# 1. Download the artifact (GitHub -> Actions -> "DB backup" -> run -> Artifacts -> hris-db-YYYY-MM-DD), or:
#      gh run list --workflow db-backup.yml
#      gh run download <run-id> -n hris-db-YYYY-MM-DD
#    You get hris-db-YYYY-MM-DD.dump.gpg (the zip wrapper is removed by gh; unzip it if downloaded from the UI).
# 2. Run:
#      BACKUP_PASSPHRASE='...' scripts/restore-backup.sh hris-db-YYYY-MM-DD.dump.gpg "postgresql://user:pass@host:5432/db"
#    Needs gpg and pg_restore (client version >= the dump's, i.e. postgresql-client-17).
#
# --clean --if-exists drops and recreates every object in the dump, so the target's current data is REPLACED.
# Prefer restoring into a fresh database or a Supabase branch first, then point the app at it.
set -euo pipefail

file="${1:?usage: restore-backup.sh <backup.dump.gpg> <target-database-url>}"
target="${2:?usage: restore-backup.sh <backup.dump.gpg> <target-database-url>}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

echo "About to restore $file into ${target##*@}"
echo "Existing objects in that database will be dropped and replaced."
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Aborted."; exit 1; }

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
gpg --batch --yes --quiet --decrypt --passphrase "$BACKUP_PASSPHRASE" -o "$dump" "$file"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$target" "$dump"
echo "Restore finished."
