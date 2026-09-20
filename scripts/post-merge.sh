#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Reject destructive or ambiguous diffs before the non-interactive push.
# Production schema changes are applied separately by Publish.
pnpm --filter @workspace/db run push-preflight
pnpm --filter @workspace/db run push-force
