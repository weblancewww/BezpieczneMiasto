#!/bin/sh
set -eu

if [ -z "${SHADOW_DATABASE:-}" ] || [ -z "${MARIADB_USER:-}" ] || [ -z "${MARIADB_PASSWORD:-}" ]; then
  exit 0
fi

mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \
	\`${SHADOW_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \
	\`${SHADOW_DATABASE}\`.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL