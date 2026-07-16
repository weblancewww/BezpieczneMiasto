#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${MYSQL_DATABASE:-}" ] && [ -n "${MYSQL_USER:-}" ] && [ -n "${MYSQL_PASSWORD:-}" ]; then
    export DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}"
  fi
fi

if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  export SHADOW_DATABASE_URL="${DATABASE_URL:-}"
fi

exec "$@"
