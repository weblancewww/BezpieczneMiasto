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

exec "$@"
