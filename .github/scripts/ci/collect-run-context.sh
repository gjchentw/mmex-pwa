#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

EVENT_NAME="${GITHUB_EVENT_NAME:-unknown}"
REF_NAME="${GITHUB_REF_NAME:-unknown}"
SHA_VALUE="${GITHUB_SHA:-unknown}"

if [[ "$EVENT_NAME" == "workflow_run" ]]; then
  require_cmd jq
  if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH:-}" ]]; then
    REF_NAME="$(jq -r '.workflow_run.head_branch // "unknown"' "$GITHUB_EVENT_PATH")"
    SHA_VALUE="$(jq -r '.workflow_run.head_sha // "unknown"' "$GITHUB_EVENT_PATH")"
  fi
fi

log_info "event=$EVENT_NAME"
log_info "ref=$REF_NAME"
log_info "sha=$SHA_VALUE"

write_output "event_name" "$EVENT_NAME"
write_output "ref_name" "$REF_NAME"
write_output "commit_sha" "$SHA_VALUE"
