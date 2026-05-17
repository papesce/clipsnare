#!/usr/bin/env bash
set -euo pipefail

if command -v docker &>/dev/null; then
  ENGINE=docker
elif command -v podman &>/dev/null; then
  ENGINE=podman
else
  echo "Error: neither docker nor podman found" >&2
  exit 1
fi

DOCKER_USER="papesce"

echo "Incrementing package patch version"
npm version patch --no-git-tag-version

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
IMAGE="${DOCKER_USER}/${NAME}"
PROD_COMPOSE_FILE="compose.prod.yml"

if [[ -f "${PROD_COMPOSE_FILE}" ]]; then
  echo "Updating ${PROD_COMPOSE_FILE} to ${IMAGE}:${VERSION}"
  node -e "
const fs = require('node:fs');
const file = process.argv[1];
const image = process.argv[2];
const content = fs.readFileSync(file, 'utf8');
const next = content.replace(/^(\s*image:\s*)\S+\s*$/m, '$1' + image);
if (next === content) {
  throw new Error('Could not find image field in ' + file);
}
fs.writeFileSync(file, next);
" "${PROD_COMPOSE_FILE}" "${IMAGE}:${VERSION}"
fi

echo "Using ${ENGINE}"

echo "Building ${IMAGE}:${VERSION}"
${ENGINE} build -t "${IMAGE}:${VERSION}" -t "${IMAGE}:latest" .

echo "Pushing ${IMAGE}:${VERSION}"
${ENGINE} push "${IMAGE}:${VERSION}"

echo "Pushing ${IMAGE}:latest"
${ENGINE} push "${IMAGE}:latest"

echo "Done: ${IMAGE}:${VERSION} and ${IMAGE}:latest"
