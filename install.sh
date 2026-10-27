#!/usr/bin/env bash
# Install the self-directed operating manual for one or more agents. Idempotent.
# Usage: ./install.sh <target>...   targets: claude | codex | project <dir> | plugin | uninstall
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANUAL="$KIT/AGENTS.md"
BEGIN="<!-- self-directed-agents:begin -->"
END="<!-- self-directed-agents:end -->"

add_block() { # file, block-content
  local f="$1" body="$2"
  mkdir -p "$(dirname "$f")"; touch "$f"
  if grep -qF "$BEGIN" "$f"; then
    if ! grep -qF "$END" "$f"; then
      echo "  WARNING: $f has the begin marker but no end marker; left untouched. Fix it by hand." >&2; return
    fi
    # Replace the existing block, so a moved kit updates its path. ENVIRON keeps backslashes literal.
    BODY="$body" awk -v b="$BEGIN" -v e="$END" '
      $0==b {print; print ENVIRON["BODY"]; skip=1; next}
      $0==e {skip=0}
      !skip {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "  updated in $f"; return
  fi
  printf '\n%s\n%s\n%s\n' "$BEGIN" "$body" "$END" >> "$f"
  echo "  added to $f"
}

[ $# -eq 0 ] && { sed -n '2,3p' "$0"; exit 1; }
while [ $# -gt 0 ]; do
  case "$1" in
    claude)  # Claude Code: import the manual into the user-level CLAUDE.md (no account features needed)
      echo "Claude Code (global):"
      add_block "$HOME/.claude/CLAUDE.md" "@$MANUAL" ;;
    codex)   # Codex CLI and other AGENTS.md readers: no import syntax, so reference by absolute path
      echo "Codex (global):"
      add_block "$HOME/.codex/AGENTS.md" "Follow the operating manual at $MANUAL for all self-directed work. Read it at the start of every task." ;;
    project) # Seed a repo with a profile template and point its agent instructions at it
      shift; DIR="${1:?project needs a directory}"
      echo "Project $DIR:"
      [ -e "$DIR/PROJECT_PROFILE.md" ] && echo "  PROJECT_PROFILE.md exists, left alone" || { cp "$KIT/templates/PROJECT_PROFILE.md" "$DIR/PROJECT_PROFILE.md"; echo "  created PROJECT_PROFILE.md (fill it in, or run the project-profile skill)"; }
      NOTE="Project facts for self-directed work (commands, invariants, environment, off-limits): see PROJECT_PROFILE.md."
      found=0
      for f in CLAUDE.md AGENTS.md; do
        if [ -e "$DIR/$f" ]; then add_block "$DIR/$f" "$NOTE"; found=1; fi
      done
      [ $found -eq 0 ] && add_block "$DIR/AGENTS.md" "$NOTE" ;;
    uninstall) # Remove the blocks this script added to the global files
      for f in "$HOME/.claude/CLAUDE.md" "$HOME/.codex/AGENTS.md"; do
        [ -e "$f" ] && grep -qF "$BEGIN" "$f" || continue
        grep -qF "$END" "$f" || { echo "  WARNING: $f has no end marker; left untouched." >&2; continue; }
        { awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip{print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"; echo "  removed from $f"; }
      done ;;
    plugin)  # Claude Code skills + workflows: install from this repo as a marketplace
      cat <<MSG
In Claude Code, run:
  /plugin marketplace add $KIT        (or the git URL of this repo)
  /plugin install self-directed@self-directed-agents
MSG
      ;;
    *) echo "unknown target: $1"; exit 1 ;;
  esac
  shift
done
