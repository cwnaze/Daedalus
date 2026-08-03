#!/usr/bin/env bash
# Push every variable in .env up to GitHub repo secrets.
# Run once after populating .env, and again whenever a value changes.
#
# Only keys present in .env.example are synced — .env.example is the allowlist,
# so a stray local variable never leaks into the repo's secret store.
set -euo pipefail

[ -f .env ] || { echo "No .env — copy .env.example to .env and fill it in first."; exit 1; }
[ -f .env.example ] || { echo "No .env.example — nothing to sync against."; exit 1; }

repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
echo "Syncing to $repo"

count=0
while IFS= read -r key; do
  value="$(grep -E "^${key}=" .env | head -n1 | cut -d= -f2- || true)"

  # Strip one layer of matching quotes. Without this, KEY="v" uploads the quote
  # characters as part of the secret and the app reads a value nothing matches.
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  if [ -z "$value" ]; then
    echo "  skip  $key (empty in .env)"
    continue
  fi
  gh secret set "$key" --repo "$repo" --body "$value"
  echo "  set   $key"
  count=$((count + 1))
done < <(grep -E '^[A-Z0-9_]+=' .env.example | cut -d= -f1)

echo "$count secret(s) synced."
echo "Note: CLAUDE_CODE_OAUTH_TOKEN and PIPELINE_PAT are pipeline secrets, not app secrets."
echo "Set those separately if you have not already."
