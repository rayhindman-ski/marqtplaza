#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
feature="${1:-}"

if [[ -z "$feature" ]]; then
  echo "Usage: pnpm speckit:plan -- .specify/specs/001-short-name" >&2
  exit 2
fi

if [[ "$feature" != /* ]]; then
  feature="$ROOT/$feature"
fi

if [[ ! -f "$feature/spec.md" ]]; then
  echo "Feature spec not found: ${feature#"$ROOT/"}" >&2
  exit 1
fi

if [[ ! -f "$feature/plan.md" ]]; then
  cp "$ROOT/.specify/templates/plan-template.md" "$feature/plan.md"
  echo "Created ${feature#"$ROOT/"}/plan.md"
else
  echo "Plan already exists: ${feature#"$ROOT/"}/plan.md"
fi
