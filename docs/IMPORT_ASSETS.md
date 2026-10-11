# Compact initial raster import — local candidate

Scope: the validated `BilgeRasterImport.commit` path used to add rasterized
presentation slides to a notebook. This is not a limit increase, a database
migration, a server change, or a production release.

## Write contract

1. Preserve the existing immutable candidate copy, image validation, account /
   notebook lease, storage estimate and note/image limits.
2. With asset writing enabled, hash each unique imported data URL and sequentially
   upsert one `{data, t}` row under its existing `asset:<sha256>` key. A known
   registry entry is not proof that its disk row still exists; refresh the row
   and timestamp too.
3. Pin the main database connection during preparation. Check the lease after
   every hash and transaction, before each write, and immediately before final
   dispatch. A missing connection is opened before preparation; a connection
   lost or replaced during preparation is a definite failure, not an automatic
   retry. No global asset mapping is published by preparation.
4. Produce a separate compact JSON snapshot using the local prepared map. The
   runtime notebook and caller's data continue to contain the original images.
   Send that JSON via the existing `dbPut` option and preserve the original
   `before-import` copy.
5. The final writer keeps its existing scope/lease, comparison-and-swap, marker,
   and same-transaction asset-existence checks. A native writer can reconnect
   to the same account; it is not pinned to the preparation connection.
6. If final validation reports a missing asset, discard the local prepared map,
   invalidate only the missing global hints, and retry through the existing
   inline serialization path. An exceptional large fallback is intentional.
7. Publish prepared mappings only after a known successful notebook commit and
   the final lease check. Lost acknowledgements and post-commit UI failures
   retain the existing reload-required write quarantine.

No failure path deletes prepared assets. A completed row may be shared by another
notebook; unreferenced leftovers remain subject to existing seven-day collection.
The original notebook, its previous copy, marker and sync state are not touched
by preparation. Asset writes are small individual transactions, not one
all-or-nothing transaction over every imported image.

## Honest performance boundary

The optimization removes repeated image strings from the **first notebook JSON
and worker message**, rather than relying on a later background migration.
The images are still stored in separate rows, and all encoded images still exist
in runtime memory. This is not full lazy loading, a claim about lower peak RAM,
or a measured improvement in Apple Pencil latency. Hashing and asset writes add
work before final commit; this tradeoff needs physical-device acceptance.

The previous implementation also shrinks its notebook record after migration.
Therefore comparing only a late database read would be a false performance
oracle. Tests must capture the first `preservePrevious` worker payload or first
native notebook `put` before background migration. These two measurements describe
the same notebook representation; do not add them as two disk savings.

## Acceptance and evidence

`npm run test:import-assets` tests native IDB and the actual save worker on local
synthetic approved accounts, without production data or external requests.
It is included in `test:pptx-staging` and thus the full `npm test` chain.

Current-turn results and an immutable prior source comparison are recorded in
`outputs/import-assets-20261011/`. The final proof, when present, is the authority
for passed counts, exact source hashes, byte measurements and failed attempts.
Until that proof exists, this document describes the contract, not a pass claim.

Release remains separate: commit/CI, stage and rollback evidence, followed by
real iPad import, reload, export and editing acceptance. No file/page limits or
version label are changed by this work.
