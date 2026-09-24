#!/usr/bin/env bash
# Vercel build: generate client, apply migrations, load starter data (idempotent), build.
set -euo pipefail
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is missing. Add your Neon connection string in Vercel → Settings → Environment Variables." >&2
  exit 1
fi
if [ -z "${AUTH_SECRET:-}" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  echo "ERROR: set AUTH_SECRET (at least 32 random characters) in Vercel environment variables." >&2
  exit 1
fi
# Migrations need a direct (non-pooled) connection. For Neon, the direct host is the pooled host without "-pooler".
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL/-pooler./.}}"
npx prisma generate
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
DATABASE_URL="$DIRECT_URL" npx tsx prisma/seed.ts
npx next build
