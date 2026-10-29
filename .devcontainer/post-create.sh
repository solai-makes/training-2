#!/usr/bin/env bash
set -euo pipefail

workspace_dir="${1:-/workspaces/training2}"
cd "$workspace_dir"

pnpm install --frozen-lockfile

echo "Dev Container setup completed: $(node --version), $(pnpm --version)"
