#!/usr/bin/env bash
# Fails if any tracked file contains a term from your personal terms list.
#
# The list is one term per line (blank lines and lines starting with # are
# skipped), matched case-insensitively as plain text. It comes from, in order:
#   1. the OTS_PERSONAL_TERMS environment variable (for CI, from a secret), or
#   2. the file .personal-terms in the repo root (gitignored, local only).
# With neither, there is nothing to check and the script says so and passes.
#
# Put in it: your name, your event's name and place names, its dates, your
# weights, your PC's hostname; anything that should never be in a public repo.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ -n "${OTS_PERSONAL_TERMS:-}" ]; then
  terms="$OTS_PERSONAL_TERMS"
  source_name="OTS_PERSONAL_TERMS"
elif [ -f .personal-terms ]; then
  terms="$(cat .personal-terms)"
  source_name=".personal-terms"
else
  echo "check-no-personal-data: no terms list (.personal-terms or OTS_PERSONAL_TERMS); nothing checked"
  exit 0
fi

patterns="$(printf '%s\n' "$terms" | tr -d '\r' | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' || true)"
if [ -z "$patterns" ]; then
  echo "check-no-personal-data: the terms list from $source_name is empty; nothing checked"
  exit 0
fi
count="$(printf '%s\n' "$patterns" | wc -l | tr -d ' ')"

# Tracked files only, so node_modules, build output and local data are never read.
# LICENSE is left out: the copyright holder's name belongs there.
hits="$(git ls-files -z -- . ':!pnpm-lock.yaml' ':!LICENSE' | xargs -0 grep -n -i -I -F -e "$patterns" -- 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-personal-data: found personal terms in tracked files:"
  # File and line number only: the matching text is not echoed into logs.
  printf '%s\n' "$hits" | cut -d: -f1,2 | sort -u | sed 's/^/  /'
  exit 1
fi

echo "check-no-personal-data: $count terms from $source_name, no matches in $(git ls-files | wc -l | tr -d ' ') tracked files"
