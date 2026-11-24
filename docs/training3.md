# Training 3

The staff business features now use PostGraphile GraphQL queries and mutations. The existing staff layout and customer API are preserved.

## Implemented

- PostGraphile 5 on POST /graphql. Catalog pagination uses a restricted PostgreSQL view. All other staff operations are named schema extensions that call domain services directly, not a REST proxy.
- Product creation/editing/deletion, stock adjustment and history, orders/search, COD collection, tracking, partner assignment/duty/profiles, analytics, price history, variants, restock demand, returns/refunds, profit/costs/expenses, support, targets, recovery, settings and staff roles use GraphQL.
- Inputs are typed in the schema and validated in domain services. Products, orders and partners have explicit GraphQL response types. Aggregated reports, settings documents and saved receipt snapshots use the JSON scalar to preserve their existing structures.
- graphql-request sends business operations; TanStack Vue Query handles reads/mutations, caching, invalidation and session isolation. Axios is retained only for login and is wrapped in Vue Query. Mutations never retry automatically.
- Staff role permissions are checked for every operation, including aliases in mixed queries. Cognito UUID usernames resolve to verified email principals so assigned staff roles work. Staff accounts are rejected from customer account routes.
- GraphQL limits request sizes, pagination and query complexity. Only one mutation is accepted at a time. Raw customer/session/payment tables and generated database CRUD are not exposed.
- CI checks types, runs unit tests, builds the apps and Docker image, executes isolated GraphQL lifecycle tests, and publishes to GHCR on main or training3 branches. Pull requests build/test without publication.

## Validation

Local checks: 49 unit tests, TypeScript checks, application builds, read-only catalog parity checks and 69 isolated GraphQL lifecycle checks passed. The lifecycle checks require a database named training3_qa and do not run against your original store data.

The final GitHub run, GHCR digest and local pull verification are recorded in docs/training3-verification.md after publication.

## Existing Dev Container

From /workspaces/training2:

    bash start-solaistore.sh

Checks:

    pnpm typecheck
    pnpm test:unit
    pnpm build
    pnpm test:graphql

The read-only GraphQL check needs the local staff API and Cognito Local running. It compares UUIDs, prices, images and variants with the compatibility API. Migration 023 is additive; do not reset the existing database or change applied migrations.

## Local image preview (PowerShell in project root)

    docker build -f infra/docker/Dockerfile.training3 -t solaistore-training3:local .
    $env:SOLAISTORE_IMAGE = 'solaistore-training3:local'
    docker compose --env-file infra/docker/compose-vars -f infra/docker/compose.training3.yml up -d --wait

Customer: http://localhost:5183
Staff: http://localhost:5184

These previews have separate database/auth/config volumes and their own initial development catalog. Your original Training 2 data remains separate. Payments remain fictional and tracking is simulated. No local credential files or database backups are included in the image.

Stop without deleting data:

    docker compose --env-file infra/docker/compose-vars -f infra/docker/compose.training3.yml stop

## Pull the published image

    Remove-Item Env:SOLAISTORE_IMAGE -ErrorAction SilentlyContinue
    docker compose --env-file infra/docker/compose-vars -f infra/docker/compose.training3.yml pull app
    docker compose --env-file infra/docker/compose-vars -f infra/docker/compose.training3.yml up -d --wait

Image: ghcr.io/solai-makes/training-2:training3. CI also publishes sha-<commit> tags. For a private package, sign in to GHCR with read:packages access. compose-vars is deliberately empty so Compose does not implicitly load a local environment file.

## Isolated mutation testing

CI starts PostgreSQL and Cognito Local, creates training3_qa, then starts the image against that database. It runs:

    node apps/private-api/src/graphql.integration.mjs
    node apps/private-api/src/staff-graphql.integration.mjs
    node apps/private-api/src/automatic-delivery.test.mjs

The mutation test exercises optimistic edit conflicts, stock, variants, duplicate expenses, settings versions, sales targets, delivery assignment/release, customer courier names, COD, return restocking/refund idempotency, support replies and inventory/support/manager/disabled roles.

## References

- https://postgraphile.org/postgraphile/5/usage-schema/
- https://postgraphile.org/postgraphile/5/extend-schema/
- https://tanstack.com/query/latest/docs/framework/vue/overview
- https://github.com/graffle-js/graffle/tree/graphql-request
- https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
