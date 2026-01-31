#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_docker=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-docker)
      require_docker=1
      shift
      ;;
    -h | --help)
      cat <<EOF
Usage: ${0##*/} [--require-docker]

Validates shell formatting/lint and config files.

Flags:
  --require-docker   Also run docker build/compose validation (fails if Docker isn't available)
EOF
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

log "validate: shell scripts"
require_cmd shellcheck
require_cmd shfmt

run shfmt -d -i 2 -bn -ci "${ROOT}/scripts"

sh_files=()
while IFS= read -r file; do
  sh_files+=("$file")
done < <(find "${ROOT}/scripts" -type f -name '*.sh' -print)

if [[ ${#sh_files[@]} -gt 0 ]]; then
  run shellcheck -x -P "${ROOT}/scripts" "${sh_files[@]}"
fi

log "validate: json"
require_cmd jq
run jq . "${ROOT}/cfg/maps.json" >/dev/null
run jq . "${ROOT}/cfg/plugins.json" >/dev/null
run jq . "${ROOT}/cs2-modded-server-panel_egg.json" >/dev/null
run jq . "${ROOT}/package.json" >/dev/null
run jq . "${ROOT}/package-lock.json" >/dev/null

log "validate: yaml"
require_cmd ruby
run ruby -ryaml -e "YAML.load_file('${ROOT}/docker-compose.yaml')" >/dev/null

if [[ $require_docker -eq 1 ]]; then
  log "validate: docker"
  docker_ok || die "docker daemon not available"

  run docker build -t cs2-modded-server-panel:local "${ROOT}"

  if docker compose version >/dev/null 2>&1; then
    run docker compose -f "${ROOT}/docker-compose.yaml" config -q
  elif have docker-compose; then
    run docker-compose -f "${ROOT}/docker-compose.yaml" config -q
  else
    die "docker compose not available (need 'docker compose' plugin or 'docker-compose' binary)"
  fi
else
  if docker_ok; then
    log "validate: docker (skipped; pass --require-docker to enforce)"
  else
    log "validate: docker (skipped; docker daemon not available)"
  fi
fi

log "validate: ok"
