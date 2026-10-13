#!/bin/sh
set -e
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  files=$(git diff --cached --name-only --diff-filter=ACM)
else
  files=""
fi
for file in $files; do
  case "$file" in
    *.png|*.jpg|*.xlsx|*.pdf|*.docx|pnpm-lock.yaml) continue ;;
  esac
  if [ -f "$file" ] && grep -E -n "PRIVATE KEY|AKIA[0-9A-Z]{16}|xox[baprs]-" "$file" >/dev/null; then
    echo "secret scan blocked $file"
    exit 1
  fi
done
