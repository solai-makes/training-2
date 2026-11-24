#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export SHOP_DEMO_PAYMENTS=1
echo 'Solaistore local demo: fictional card and QR payments; no money is charged.'
node apps/private-api/src/setup-restock.ts
node apps/private-api/src/setup-customer-activity.ts
node apps/private-api/src/setup-graphql.ts
exec pnpm -r --parallel --filter './apps/*' run dev
