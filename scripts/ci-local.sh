#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_docker=0

usage() {
  cat <<USAGE
Usage: ${0##*/} [--require-docker] [--skip-docker]

Runs the same checks as CI.

Flags:
  --require-docker   Enforce Docker validation (default in CI)
  --skip-docker      Skip Docker validation (useful when Docker isn't available)

Env:
  CI_REQUIRE_DOCKER=1  Same as --require-docker
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-docker)
      require_docker=1
      shift
      ;;
    --skip-docker)
      require_docker=0
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

if [[ "${CI_REQUIRE_DOCKER:-}" == "1" ]]; then
  require_docker=1
fi

cd "${ROOT}"

require_cmd node
require_cmd npm

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${node_major}" -lt 20 || "${node_major}" -ge 23 ]]; then
  die "unsupported Node.js version $(node -v). Use Node 20.x - 22.x (see package.json engines)."
fi

log "ci-local: install dependencies"
run npm ci

log "ci-local: format check"
run npm run format:check

log "ci-local: lint"
run npm run lint

log "ci-local: test"
run npm test

log "ci-local: validate"
if [[ $require_docker -eq 1 ]]; then
  run npm run validate -- --require-docker
else
  run npm run validate
fi

log "ci-local: ok"
