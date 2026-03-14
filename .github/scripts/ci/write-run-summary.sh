#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

if [[ $# -lt 1 ]]; then
  log_error "Usage: write-run-summary.sh <heading> [line ...]"
  exit 1
fi

HEADING="$1"
shift

if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]; then
  log_warn "GITHUB_STEP_SUMMARY is not set; skipping summary write"
  exit 0
fi

{
  printf '## %s\n\n' "$HEADING"
  for line in "$@"; do
    printf '%s\n' "$line"
  done
  printf '\n'
} >>"$GITHUB_STEP_SUMMARY"
