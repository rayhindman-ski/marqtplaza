#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: pnpm speckit:new -- \"short feature name\"" >&2
  exit 2
fi

slug="$(printf '%s' "$INPUT" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"

if [[ -z "$slug" ]]; then
  echo "Feature name must contain at least one letter or number." >&2
  exit 2
fi

last="$(
  find "$ROOT/.specify/specs" -mindepth 1 -maxdepth 1 -type d \
    -printf '%f\n' 2>/dev/null \
    | sed -nE 's/^([0-9]{3})-.*/\1/p' \
    | sort -n | tail -1
)"
next=1
if [[ -n "$last" ]]; then
  next=$((10#$last + 1))
fi

id="$(printf '%03d' "$next")"
feature_dir="$ROOT/.specify/specs/$id-$slug"
if [[ -e "$feature_dir" ]]; then
  echo "Feature directory already exists: ${feature_dir#"$ROOT/"}" >&2
  exit 1
fi

mkdir -p "$feature_dir"
cp "$ROOT/.specify/templates/spec-template.md" "$feature_dir/spec.md"
cp "$ROOT/.specify/templates/plan-template.md" "$feature_dir/plan.md"
cp "$ROOT/.specify/templates/tasks-template.md" "$feature_dir/tasks.md"

today="$(date +%F)"
branch="$id-$slug"
title="$(printf '%s' "$INPUT" | sed 's/[&/\]/\\&/g')"
for file in "$feature_dir/spec.md" "$feature_dir/plan.md" "$feature_dir/tasks.md"; do
  sed -i \
    -e "s/\[FEATURE NAME\]/$title/g" \
    -e "s/\[###-short-name\]/$branch/g" \
    -e "s/\[YYYY-MM-DD\]/$today/g" \
    "$file"
done

printf 'Created %s\n' "${feature_dir#"$ROOT/"}"
