# Training 3 verification

Verified on 2026-11-24 (Japan time).

## All nine requirements

| Requirement | Result |
|---|---|
| Staff business functions use GraphQL through PostGraphile | Complete |
| graphql-request and TanStack Vue Query on the staff client | Complete |
| Remaining Axios login request wrapped in Vue Query | Complete |
| CI type checking | Passed |
| CI unit and integration tests | Passed: 53 unit tests, 69 lifecycle checks, automatic-delivery and migration-safety regressions |
| CI application build | Passed |
| CI Docker image creation | Passed |
| CI push to GHCR | Passed |
| Pull the published image locally and run containers | Passed |

CI: https://github.com/solai-makes/training-2/actions/runs/45344586854

Source commit: 66068d06de3e28668603c2af5a86cdc06ef5669e

Branch: training3/graphql-migration. Main was not modified.

Published tags:

- ghcr.io/solai-makes/training-2:training3
- ghcr.io/solai-makes/training-2:sha-66068d06de3e28668603c2af5a86cdc06ef5669e

Pulled registry digest:

    sha256:b0666ca74975c5093c79d96b50d9909880af17a824f54a57e4b567cd28900582

The local Compose app runs the GHCR-pulled training3 tag and reports healthy. Both API health endpoints and the authenticated read-only GraphQL parity check passed after the pull.

Local image preview:

- Customer: http://localhost:5183
- Staff: http://localhost:5184

These image previews use their own database/auth volumes. The original development sites and store records remain in the Training 2 environment on ports 5173/5174.

During the first local pull test, two legacy migration fingerprints differed because their original files mixed Windows and Linux line endings. The reconciliation tool verified all 23 released SQL files against the original sources before updating only those two fingerprints. No migrations were rerun and no store records were changed. Regression tests verify that changed SQL or unknown fingerprints are rejected and rolled back.

This verification-only follow-up uses [skip ci]; it does not change the tested application code or published image.

## Product edit regression

The save validator accepts valid ISO timestamps with timezone offsets, including the fractional precision returned by PostGraphile. It still rejects malformed timestamps and stale edits. The lifecycle test now loads the optimistic-edit timestamp from the GraphQL catalog before saving, matching the staff UI path. The corrected image was pulled and the local preview reports healthy.
