#!/usr/bin/env bash

set -euo pipefail

log_info() {
  echo "[ci][info] $*"
}

log_warn() {
  echo "[ci][warn] $*"
}

log_error() {
  echo "[ci][error] $*" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Required command not found: $cmd"
    exit 1
  fi
}

write_output() {
  local key="$1"
  local value="$2"
  if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
    log_warn "GITHUB_OUTPUT is not set; skipping output: $key"
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
}
