#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n $(git status --porcelain) ]]; then
  echo 'Deploy from a clean committed worktree.' >&2
  exit 1
fi

revision=$(git rev-parse HEAD)
[[ $revision =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit revision' >&2; exit 2; }
destination="dist/whirred-io/$revision"

# Upload only the files required by the two Docker builds.
ssh -o BatchMode=yes -o ConnectTimeout=10 whirred.io "mkdir -p '$destination'"
rsync -az -e 'ssh -o BatchMode=yes -o ConnectTimeout=10' \
  --exclude docs/.vitepress/dist --exclude docs/.vitepress/cache --exclude docs/.vitepress/.temp \
  Dockerfile .dockerignore package.json package-lock.json \
  docs deploy whirred.io:"$destination/"

ssh -o BatchMode=yes -o ConnectTimeout=10 whirred.io \
  "bash '$destination/deploy/remote.sh' '$revision'"

for path in / /articles/strangler-fig-demo /articles/series/IAM-System-Demo/graphql-at-scale-first-draft \
            /musicshak/ /musicshak/about /musicshak/js/app.da613854.js; do
  curl --fail --silent --show-error --location --output /dev/null "https://whirred.io$path"
  echo "OK https://whirred.io$path"
done

echo "Deployed revision $revision"
