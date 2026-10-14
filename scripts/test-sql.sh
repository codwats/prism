#!/usr/bin/env bash
# Runs the SQL tests against a throwaway Supabase Postgres: applies
# supabase-schema.sql twice (the second pass proves every migration block is
# idempotent), then each tests/*.sql. Needs only docker; psql runs in the container.
#   npm run test:sql                 # every tests/*.sql
#   npm run test:sql -- tests/x.sql  # just these
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=supabase/postgres:17.11.0.002
NAME="prism-sql-test-$$"

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

psql_as() { local user=$1; shift; docker exec -i -e PGPASSWORD=postgres -e PGOPTIONS=-cclient_min_messages=warning "$NAME" psql -h localhost -U "$user" -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
# postgres is the role Supabase's SQL editor runs as, so the schema and tests do too.
psql_in() { psql_as postgres "$@"; }

# Over TCP, because the image's init scripts run on the socket before the real start.
for _ in $(seq 120); do
  [ "$(psql_in -tAc "SELECT to_regclass('auth.users') IS NOT NULL" 2>/dev/null)" = t ] && break
  sleep 1
done
[ "$(psql_in -tAc "SELECT to_regclass('auth.users') IS NOT NULL")" = t ] || { echo "sql: database not ready after 120 s" >&2; exit 1; }

psql_as supabase_admin < tests/helpers/supabase-services-stub.sql
for pass in 1 2; do
  echo "schema: apply $pass"
  psql_in < supabase-schema.sql >/dev/null
done

files=("$@")
[ ${#files[@]} -gt 0 ] || files=(tests/*.sql)
for f in "${files[@]}"; do
  echo "test: $f"
  psql_in < "$f" >/dev/null
done
echo "sql: ok"
