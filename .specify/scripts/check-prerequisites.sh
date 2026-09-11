#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
missing=()

for required in \
  "$ROOT/.specify/memory/constitution.md" \
  "$ROOT/.specify/templates/spec-template.md" \
  "$ROOT/.specify/templates/plan-template.md" \
  "$ROOT/.specify/templates/tasks-template.md" \
  "$ROOT/.specify/specs"; do
  [[ -e "$required" ]] || missing+=("${required#"$ROOT/"}")
done

if ((${#missing[@]} > 0)); then
  printf 'Spec Kit prerequisites missing:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

printf 'Spec Kit prerequisites are present.\n'
printf 'Constitution: .specify/memory/constitution.md\n'
printf 'Feature specs: .specify/specs/\n'
