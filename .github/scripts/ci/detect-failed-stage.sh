#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

if [[ $# -eq 0 ]]; then
  log_error "Usage: detect-failed-stage.sh stage=status [stage=status ...]"
  exit 1
fi

FAILED_STAGE="none"
FAILED_STATUS="success"

for pair in "$@"; do
  stage="${pair%%=*}"
  status="${pair#*=}"

  if [[ "$status" == "failure" || "$status" == "cancelled" || "$status" == "timed_out" || "$status" == "action_required" ]]; then
    FAILED_STAGE="$stage"
    FAILED_STATUS="$status"
    break
  fi

done

write_output "failed_stage" "$FAILED_STAGE"
write_output "failed_status" "$FAILED_STATUS"

if [[ "$FAILED_STAGE" != "none" ]]; then
  log_info "Detected failed stage: $FAILED_STAGE ($FAILED_STATUS)"
else
  log_info "No failed stage detected"
fi
