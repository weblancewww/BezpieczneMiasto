#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${MYSQL_DATABASE:-}" ] && [ -n "${MYSQL_USER:-}" ] && [ -n "${MYSQL_PASSWORD:-}" ]; then
    export DATABASE_URL="$(node -e 'const user = process.env.MYSQL_USER || ""; const password = process.env.MYSQL_PASSWORD || ""; const database = process.env.MYSQL_DATABASE || ""; process.stdout.write(`mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@db:3306/${encodeURIComponent(database)}`)')"
  fi
fi

if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  export SHADOW_DATABASE_URL="${DATABASE_URL:-}"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  npm run db:deploy

  SHOULD_SEED="$(node -e 'const mariadb = require("mariadb"); const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://"); (async () => { let connection; try { connection = await mariadb.createConnection(databaseUrl); const rows = await connection.query("SELECT COUNT(*) AS count FROM User"); const count = Number(rows[0]?.count ?? 0); process.stdout.write(count === 0 ? "yes" : "no"); } catch (error) { console.error(error); process.exit(1); } finally { if (connection) { await connection.end(); } } })();')"

  if [ "$SHOULD_SEED" = "yes" ]; then
    npm run db:seed
  fi
fi

exec "$@"
