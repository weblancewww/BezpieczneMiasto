#!/bin/sh
#
# Start kontenera aplikacji:
#   1. ustalenie adresu bazy (DATABASE_URL),
#   2. synchronizacja schematu z prisma/schema.prisma,
#   3. zasilenie bazy danymi demonstracyjnymi, gdy nie ma jeszcze kont.
#
# Projekt NIE używa katalogu `prisma/migrations`, dlatego `prisma migrate deploy`
# nie ma tu czego wdrażać, a na niepustej bazie kończy się błędem P3005.
# Schemat utrzymujemy przez `prisma db push` — jest idempotentne i dokłada
# brakujące tabele oraz kolumny, nie ruszając istniejących danych.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${MYSQL_DATABASE:-}" ] && [ -n "${MYSQL_USER:-}" ] && [ -n "${MYSQL_PASSWORD:-}" ]; then
    export DATABASE_URL="$(node -e 'const user = process.env.MYSQL_USER || ""; const password = process.env.MYSQL_PASSWORD || ""; const database = process.env.MYSQL_DATABASE || ""; process.stdout.write(`mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@db:3306/${encodeURIComponent(database)}`)')"
  fi
fi

if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  if [ -n "${SHADOW_DATABASE:-}" ] && [ -n "${MYSQL_USER:-}" ] && [ -n "${MYSQL_PASSWORD:-}" ]; then
    export SHADOW_DATABASE_URL="$(node -e 'const user = process.env.MYSQL_USER || ""; const password = process.env.MYSQL_PASSWORD || ""; const database = process.env.SHADOW_DATABASE || ""; process.stdout.write(`mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@db:3306/${encodeURIComponent(database)}`)')"
  fi
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] Synchronizuję schemat bazy z prisma/schema.prisma (prisma db push)…"

  if ! npm run db:push; then
    echo "[entrypoint] BŁĄD: prisma db push nie powiódł się — schemat bazy pozostał niezmieniony."
    echo "[entrypoint] Sprawdź DATABASE_URL oraz czy usługa 'db' przyjmuje połączenia."
    exit 1
  fi

  SEED_STATE="$(node -e 'const mariadb = require("mariadb"); const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://"); (async () => { let connection; try { connection = await mariadb.createConnection(databaseUrl); const userRows = await connection.query("SELECT COUNT(*) AS count FROM User"); const users = Number(userRows[0]?.count ?? 0); if (users > 0) { process.stdout.write("ready"); return; } const reportRows = await connection.query("SELECT COUNT(*) AS count FROM Report"); const reports = Number(reportRows[0]?.count ?? 0); process.stdout.write(reports > 0 ? "data-without-users" : "empty"); } catch (error) { console.error(error); process.exit(1); } finally { if (connection) { await connection.end(); } } })();')"

  case "$SEED_STATE" in
    empty)
      echo "[entrypoint] Baza bez kont — uruchamiam SEED z danymi demonstracyjnymi…"
      npm run db:seed
      ;;
    data-without-users)
      echo "[entrypoint] UWAGA: brak kont, ale istnieją zgłoszenia — SEED pomijam, żeby nie usunąć danych."
      ;;
    *)
      echo "[entrypoint] Baza ma już konta — SEED pominięty."
      ;;
  esac
else
  echo "[entrypoint] BRAK DATABASE_URL — pomijam synchronizację schematu oraz SEED."
  echo "[entrypoint] Ustaw DATABASE_URL albo komplet MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD."
fi

exec "$@"
