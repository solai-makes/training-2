#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export SHOP_DEMO_PAYMENTS=1
echo 'Solaistore local demo: fictional card and QR payments; no money is charged.'
exec pnpm -r --parallel --filter './apps/*' run dev
