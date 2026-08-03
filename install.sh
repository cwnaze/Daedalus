#!/usr/bin/env bash
# Install the Phase 1 skills into ~/.claude/skills.
#
# Phase 2/3 lives in repo-template/ and is NOT installed globally — repo-bootstrap
# copies it into each new project repo, so it can be edited per-project without
# forking this repo.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
MODE="copy"
FORCE=0

usage() {
  cat <<'USAGE'
Usage: ./install.sh [options]

  --link      Symlink instead of copying, so edits in this repo take effect
              immediately. Recommended while you are still iterating.
  --force     Overwrite existing skills of the same name without asking.
  --uninstall Remove the Phase 1 skills from ~/.claude/skills.
  --check     Verify prerequisites and print what would happen. No changes.
  -h, --help  This.

Env:
  CLAUDE_SKILLS_DIR   Override the install destination.
USAGE
}

# Two entry points, one shared tail. project-intake starts a new project;
# codebase-inventory starts from an existing one. Both converge on project-docs.
SKILLS=(project-intake stack-and-mcp-selection codebase-inventory refactor-intake
        project-docs story-breakdown repo-bootstrap)

check_prereqs() {
  local ok=0
  for tool in git gh node jq; do
    if command -v "$tool" >/dev/null 2>&1; then
      echo "  ok      $tool"
    else
      echo "  MISSING $tool"
      ok=1
    fi
  done

  if command -v claude >/dev/null 2>&1; then
    echo "  ok      claude ($(claude --version 2>/dev/null || echo 'version unknown'))"
  else
    echo "  MISSING claude — install Claude Code first"
    ok=1
  fi

  if gh auth status >/dev/null 2>&1; then
    echo "  ok      gh authenticated"
  else
    echo "  MISSING gh auth — run: gh auth login"
    ok=1
  fi

  if [ -d "$HOME/Notes" ]; then
    echo "  ok      vault at ~/Notes"
  else
    echo "  note    ~/Notes not found — Phase 1 writes docs there; set VAULT_DIR or create it"
  fi

  return $ok
}

uninstall() {
  for s in "${SKILLS[@]}"; do
    if [ -e "$DEST/$s" ] || [ -L "$DEST/$s" ]; then
      rm -rf "$DEST/$s"
      echo "  removed $s"
    fi
  done
  echo "Done."
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --link) MODE="link" ;;
    --force) FORCE=1 ;;
    --uninstall) uninstall ;;
    --check) echo "Prerequisites:"; check_prereqs; echo; echo "Would install ${#SKILLS[@]} skills to $DEST ($MODE)"; exit $? ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

echo "Prerequisites:"
if ! check_prereqs; then
  echo
  echo "Install the missing tools above, then re-run. (Skills will still install," \
       "but Phase 1 will fail partway without them.)"
  if [ "$FORCE" -eq 0 ]; then
    read -rp "Continue anyway? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || exit 1
  fi
fi

echo
mkdir -p "$DEST"

for s in "${SKILLS[@]}"; do
  if [ ! -d "$SRC/phase1/$s" ]; then
    echo "  ERROR   $s missing from repo — is this a full clone?"
    exit 1
  fi

  if [ -e "$DEST/$s" ] || [ -L "$DEST/$s" ]; then
    if [ "$FORCE" -eq 0 ]; then
      read -rp "  $s already exists. Replace? [y/N] " reply
      [[ "$reply" =~ ^[Yy]$ ]] || { echo "  skipped $s"; continue; }
    fi
    rm -rf "$DEST/$s"
  fi

  if [ "$MODE" = "link" ]; then
    ln -s "$SRC/phase1/$s" "$DEST/$s"
    echo "  linked  $s"
  else
    cp -r "$SRC/phase1/$s" "$DEST/$s"
    echo "  copied  $s"
  fi
done

echo
echo "Installed to $DEST"
echo
echo "Start a project:  claude  →  /project-intake"
if [ "$MODE" = "copy" ]; then
  echo "Editing the skills? Re-run with --link so changes here take effect immediately."
fi
