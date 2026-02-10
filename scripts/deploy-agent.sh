#!/bin/bash
set -e

VPS="ike@100.111.3.40"
REMOTE_DIR="~/jarvis-agent"

echo "==> Building locally..."
pnpm build

echo "==> Syncing packages to VPS..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude .env.local \
  packages/ "$VPS:$REMOTE_DIR/packages/"

echo "==> Syncing root config..."
rsync -avz \
  package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json \
  "$VPS:$REMOTE_DIR/"

echo "==> Installing deps & restarting service..."
ssh "$VPS" "cd $REMOTE_DIR && pnpm install --frozen-lockfile && systemctl --user restart jarvis-agent"

echo "==> Done! Checking status..."
ssh "$VPS" "systemctl --user status jarvis-agent --no-pager"
