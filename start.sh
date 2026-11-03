#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${RUSH_ADMIN_PASSWORD:-}" ]]; then
  read -rsp 'Choose your Rush admin password (14+ characters): ' RUSH_ADMIN_PASSWORD
  echo
  export RUSH_ADMIN_PASSWORD
fi
exec python3 server.py
