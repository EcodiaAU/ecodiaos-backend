#!/usr/bin/env bash
# macOS / Linux installer for the ecodia-preview extension - sister of install.ps1.
# Symlinks the extension dir into each VS Code edition's extensions dir so the
# extension activates on the next IDE start. Idempotent.
set -e

SRC="${ECODIA_PREVIEW_SRC:-$HOME/eos-laptop-agent/cursor-preview-extension}"
NAME="ecodia.preview-0.1.0"

if [ ! -d "$SRC" ]; then
  echo "ERROR: source dir not found: $SRC" >&2
  echo "Set ECODIA_PREVIEW_SRC if the extension lives elsewhere." >&2
  exit 1
fi

for d in \
  "$HOME/.vscode/extensions" \
  "$HOME/.vscode-insiders/extensions" \
  "$HOME/.cursor/extensions"; do
  if [ ! -d "$d" ]; then
    echo "skip (no $d)"
    continue
  fi
  target="$d/$NAME"
  rm -rf "$target" 2>/dev/null || true
  ln -s "$SRC" "$target"
  if [ -L "$target" ]; then
    echo "linked $target -> $SRC"
  else
    echo "FAILED: $target" >&2
  fi
done

echo ""
echo "Now reload each running IDE window:"
echo "  Cmd+Shift+P -> 'Developer: Reload Window'"
echo "Or start the IDE fresh - the extension will activate on the next launch."
