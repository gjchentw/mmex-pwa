#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

BLOCKING_STAGES=("build" "e2e-tests")

FAILED_STAGE="none"
FAILED_STATUS="success"
IS_BLOCKING="false"

for pair in "$@"; do
  stage="${pair%=*}"
  status="${pair#*=}"

  if [[ "$status" == "failure" || "$status" == "cancelled" || "$status" == "timed_out" ]]; then
    if [[ "$FAILED_STAGE" == "none" ]]; then
      FAILED_STAGE="$stage"
      FAILED_STATUS="$status"
    fi

    for blocking in "${BLOCKING_STAGES[@]}"; do
      if [[ "$stage" == "$blocking" ]]; then
        IS_BLOCKING="true"
        break 2
      fi
    done
  fi
done

write_output "failed_stage" "$FAILED_STAGE"
write_output "failed_status" "$FAILED_STATUS"
write_output "is_blocking" "$IS_BLOCKING"
