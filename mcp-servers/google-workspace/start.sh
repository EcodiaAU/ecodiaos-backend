#!/bin/bash
# Source ~/ecodiaos/.env so dotenv-style quoted values (notably
# GOOGLE_SERVICE_ACCOUNT_JSON='{"type":...}' which is necessarily quoted
# because the value contains spaces) are parsed correctly by the shell.
#
# Previous implementation used `grep + sed` which preserved the surrounding
# single quotes as literal chars in the env var, then auth.js's JSON.parse
# threw "Unexpected token ''', \"'{\"type\":\"\"... is not valid JSON" on
# every Gmail/Calendar/Drive/Contacts call. Fixed 2026-06-04.
set -a
. ~/ecodiaos/.env
set +a

# auth.js reads SUPABASE_SERVICE_ROLE_KEY; .env stores it as SUPABASE_SERVICE_KEY.
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"

exec node /home/tate/ecodiaos/mcp-servers/google-workspace/index.js
