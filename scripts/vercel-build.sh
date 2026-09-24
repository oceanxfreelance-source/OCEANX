#!/usr/bin/env bash
# Vercel build: generate client, apply migrations, load starter data (idempotent), build.
set -euo pipefail
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
if [ -z "${AUTH_SECRET:-}" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  echo "ERROR: set AUTH_SECRET (at least 32 random characters) in Vercel environment variables." >&2
  exit 1
fi
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npx next build
