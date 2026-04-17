#!/bin/sh
set -e

echo "[entrypoint] DATABASE_PROVIDER=${DATABASE_PROVIDER:-postgresql}"

# Rewrite prisma schema provider based on env, then run the correct migration command.
node_modules/.bin/tsx scripts/prisma-provider.ts || true

case "${DATABASE_PROVIDER:-postgresql}" in
  postgresql)
    echo "[entrypoint] applying postgres migrations"
    node_modules/.bin/prisma migrate deploy || {
      echo "[entrypoint] prisma migrate deploy failed; continuing (may be first-run against empty schema)"
    }
    ;;
  sqlite)
    echo "[entrypoint] ensuring sqlite schema via db push"
    node_modules/.bin/prisma db push --accept-data-loss
    ;;
  *)
    echo "[entrypoint] unsupported DATABASE_PROVIDER=${DATABASE_PROVIDER}" >&2
    exit 1
    ;;
esac

if [ -f prisma/seed.ts ]; then
  echo "[entrypoint] running seed"
  node_modules/.bin/tsx prisma/seed.ts || echo "[entrypoint] seed failed (non-fatal)"
fi

exec "$@"
