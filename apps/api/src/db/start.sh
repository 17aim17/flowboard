#!/bin/sh
# Migrate, seed (only an empty database), then serve. For hosts with no separate release step, like
# Render's free plan. Docker Compose runs the same steps as its own migrate service instead.
set -e
node src/db/migrate.ts
node src/db/seed.ts
exec node src/server.ts
