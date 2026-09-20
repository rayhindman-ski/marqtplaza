#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Applies merged schema changes to development. Resolve any rename ambiguity
# explicitly before merge; production schema changes are applied by Publish.
pnpm --filter @workspace/db run push
