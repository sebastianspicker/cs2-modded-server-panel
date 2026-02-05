#!/usr/bin/env bash
set -euo pipefail

# Mirror of the installation script embedded in `cs2-modded-server-panel_egg.json`,
# kept as a standalone file so it can be linted (shellcheck) and reviewed easily.

DEFAULT_USERNAME="${DEFAULT_USERNAME:-cspanel}"
DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-v67ic55x4ghvjfj}"
DEFAULT_PORT="${DEFAULT_PORT:-3000}"
ALLOW_DEFAULT_CREDENTIALS="${ALLOW_DEFAULT_CREDENTIALS:-true}"

rm -rf /home/container/* /home/container/.[!.]* /home/container/..?*

git clone https://github.com/sebastianspicker/cs2-modded-server-panel.git /home/container
cd /home/container
git checkout cddb89c986349426a13b75ea3b86a7fae0914d8e

cat >.env <<EOF
DEFAULT_USERNAME=${DEFAULT_USERNAME}
DEFAULT_PASSWORD=${DEFAULT_PASSWORD}
ALLOW_DEFAULT_CREDENTIALS=${ALLOW_DEFAULT_CREDENTIALS}
PORT=${DEFAULT_PORT}
EOF

npm ci --omit=dev --build-from-source=bcrypt

git rev-parse --short HEAD || true

chown -R 1000:1000 /home/container
