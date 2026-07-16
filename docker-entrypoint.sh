#!/bin/sh
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
  npm run db:deploy

  SEED_STATE="$(node -e 'const mariadb = require("mariadb"); const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://"); (async () => { let connection; try { connection = await mariadb.createConnection(databaseUrl); const rows = await connection.query("SHOW TABLES LIKE \"User\""); if (!Array.isArray(rows) || rows.length === 0) { process.stdout.write("missing-table"); return; } const countRows = await connection.query("SELECT COUNT(*) AS count FROM User"); const count = Number(countRows[0]?.count ?? 0); process.stdout.write(count === 0 ? "empty" : "ready"); } catch (error) { console.error(error); process.exit(1); } finally { if (connection) { await connection.end(); } } })();')"

  if [ "$SEED_STATE" = "missing-table" ]; then
    npm run db:push
    npm run db:seed
  elif [ "$SEED_STATE" = "empty" ]; then
    npm run db:seed
  fi
fi

exec "$@"
