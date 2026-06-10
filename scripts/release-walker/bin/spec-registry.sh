#!/usr/bin/env bash
# spec-registry.sh - resolve <app> slug to its release-walker spec path.
# Per ARCHITECTURE.md Section 5: spec location is unified at
# <app-repo>/.release-walker/spec.yml; this is the only central artefact.
# Portable to bash 3.2 (macOS default) via case statement.
set -euo pipefail

resolve_spec_path() {
  app="${1:?app slug required}"
  case "$app" in
    locals)    path=/Users/ecodia/.code/locals-shared/.release-walker/spec.yml ;;
    coexist)   path=/Users/ecodia/.code/coexist/.release-walker/spec.yml ;;
    # glovebox/ (old Capacitor monorepo dir) is not a git repository; the
    # spec lives in the version-controlled Android-first native repo.
    glovebox)  path=/Users/ecodia/.code/glovebox-android/.release-walker/spec.yml ;;
    goodreach) path=/Users/ecodia/.code/goodreach/.release-walker/spec.yml ;;
    *) echo "FATAL: no spec registered for app '$app'" >&2; return 1 ;;
  esac
  [ -f "$path" ] || { echo "FATAL: spec path '$path' does not exist for app '$app'" >&2; return 1; }
  echo "$path"
}

list_apps() {
  cat <<'LIST'
coexist    -> /Users/ecodia/.code/coexist/.release-walker/spec.yml
glovebox   -> /Users/ecodia/.code/glovebox-android/.release-walker/spec.yml
goodreach  -> /Users/ecodia/.code/goodreach/.release-walker/spec.yml
locals     -> /Users/ecodia/.code/locals-shared/.release-walker/spec.yml
LIST
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-list}" in
    resolve) resolve_spec_path "$2" ;;
    list)    list_apps ;;
    *)       echo "usage: $0 {resolve <app>|list}" >&2; exit 2 ;;
  esac
fi
