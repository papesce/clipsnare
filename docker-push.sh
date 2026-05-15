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

echo "Using ${ENGINE}"

echo "Building ${IMAGE}:${VERSION}"
${ENGINE} build -t "${IMAGE}:${VERSION}" -t "${IMAGE}:latest" .

echo "Pushing ${IMAGE}:${VERSION}"
${ENGINE} push "${IMAGE}:${VERSION}"

echo "Pushing ${IMAGE}:latest"
${ENGINE} push "${IMAGE}:latest"

echo "Done: ${IMAGE}:${VERSION} and ${IMAGE}:latest"
