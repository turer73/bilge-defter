# v78 cache stamp components without a second gesture

## Baseline and question

At source `3f07ad0b5b9480a2b2a47dfcc5950830e65c9782`, Linux CI37968069265
attempt2 observed WebKit A9 differing pixels, M0, T13. M and T finished at the
same exact raw point and visible content/geometry. T contains two actual forward
drag commits, without UI undo or return to the starting point. Neither operation
is necessary for that T observation; second-commit-only causality was not proven.
The unchanged mandatory gate remained53/54. No product fix or device acceptance.

This follow-up changes two synthetic cache stamp inputs after the one real M
commit, inside the existing pre-close browser call. It does not simulate a second
real commit and does not change any application asset.

| Cell | Assign a new shallow strokes list | Call existing touchPage once |
| --- | --- | --- |
| Sham | No | No |
| List | Yes | No |
| Revision | No | Yes |
| Both | Yes | Yes |

Every cell allocates the same shallow copy and observes/retains the same bounded
references. Only the two selected operations differ. Frozen A, M and T are fresh
controls, with complete copied-runner bytes unchanged from the preceding helper.

## Why not scheduleSave

`scheduleSave` calls `markChanged` and `flushSave`: it changes updated/editRevision,
sync and save UI, serializes state, starts I/O, and may influence later rendering.
It is not a revision-only operation. Existing `touchPage` only increments the
pageRevs WeakMap counter. This deliberately synthetic intervention tests cache
stamp components, not full save behavior or a proposed product correction.

## Non-negotiable validity gates

- Freeze the original full raster audit body, final quality loop, prior helpers,
  canonical runner and all246 release assets. No relaxed quality threshold.
- Inject only into the already existing pre-close evaluate. No additional
  pointer, browser turn, wait, draw, layout query, screenshot or pixel readback.
- Bound receipt size and record before/after identity and scalar checks. All
  stroke, point-array and point identities, values and order must remain exact.
  A list assignment must really change the list identity; its absence must
  preserve it. Page revision changes only in the revision cells and by exactly1.
- Preserve undo depth/entries, selected target, updated, editRevision, active
  page, pending/gesture state and unrelated page identities/content. Any
  unintended mutation invalidates the experiment instead of being normalized.
- All four final raw visible models and closed geometries must equal fresh M
  exactly. Recompute hashes; no coordinate rounding or tolerance for final
  equality, including tiny internally coherent differences. Match measured
  content to actual observer records, not only to an expected nominal point.
- Interpret only with fresh A and T reproduction, clean M and clean sham,
  and valid final equality. Otherwise retain the data as inconclusive.
- Preserve runtime errors, terminal metric failures and skipped/unmeasured
  phases. Diagnostic completion cannot pass the mandatory failed release gate.

## Interpretation limits

The list and revision are inputs to both ink-stamp and page-height caches.
Either operation causing a difference need not mean separate root causes;
both may exercise a common invalidation path. A clean injected operation does
not establish its irrelevance during the real T gesture sequence.

No additional draw call is not the same as identical raster work. Invalidating
the stamp may make the existing cancelMediaMode draw recreate scratch/tiles at
the earlier layout size before the resize observer settles the final geometry.
Any changed raster history is part of this intervention, not an isolated direct
effect of a JavaScript reference/counter or proof of stale-tile reuse.

Common extra allocation/observation may itself affect timing or retention.
Sham must stay clean before attributing a contrast to the selected bits. Even
then, only this injected path is measured; actual save/commit behavior, browser
backend mechanism and physical iPad transfer remain unproven.

The inherited terminal oracle waits two animation frames and performs four
draws. It is not the first native frame. A retains its frozen continuation;
M/T and derived cells stop at the original terminal boundary. Visible data is
fully compared; hidden rows require bounded identity/value checks, not a claim
of unlimited notebook verification.

## Execution and ownership

```sh
node --test work/test-ink-stamp.cjs
node work/diagnose-ink-stamp.cjs
```

CLAIM102437: driver author owns the new driver, test author owns the new pure
tests; root owns this document, failure-only workflow wiring and new ignored
`outputs/ink-stamp-diagnostic/` evidence. Root alone runs browsers/tests, Git/CI,
and writes proof. A separate read-only reviewer checks source and result ledgers.
No product change, merge, deployment or real notebook access is included.

## Local verification and Linux boundary

77/77 pure guards passed:65 preceding tests and12 new stamp tests. Two earlier
test-harness attempts failed and were preserved: the first selected an ambiguous
function-source marker, the second passed VM-realm arrays into a Node strict
comparison. Only the new test helper was corrected (exact declaration anchors
and JSON transport into the receiving realm); no product, oracle or threshold
was changed. Final fixture tests run the actual pinned touchPage and gesture
handlers, but inject the hit target and interior bounds behavior. Browser
records separately validate real selection and unchanged values/references.

Windows run20261009183351517 completed14/14 clean cases, Node24.13.0,
Playwright1.62.1. A and T did not reproduce, so classification is inconclusive,
not an application correction. Root independently decoded28 actual/reference
PNGs; all recomputed metrics were zero and agreed with browser reports.

- Driver SHA `03657df29010d3a4cde91d50b8ae674269ece6cafd0e9917f5b0667fde740cbc`.
- Tests SHA `9a450adc177cb96b832ee3dce3fa1623409e85c332493445b15fe575d1012ed7`.
- Local result SHA `ad914dc507154698c79e9c554796367c1a1564ec2458535c1a762f7e4e43c790`.
- M/T/all four cell visible ink hash
  `7b5f88cdaf21767e1577e82f0d65abe1dbe00ff3372191462febe52dc3dca7d9`.
- All closed geometry hash
  `13c48c132faa2cf18f60d2c950e0f8a753cb3e6b79bf77919219acf7824137ab`.

Every receipt binds full pre/post values and identities, then projects visible
rows into the actual final measured ink and checks actual terminal page revisions.
Even coherent5e-10 final coordinate drift cannot pass equality. Fresh A/T failure,
clean M and clean sham remain mandatory interpretation guards.

Separate source review found no blocking issue; it did not execute tests or
establish browser acceptance. Same-source Linux CI is still required. Local
passes do not substitute for the unchanged mandatory release gate. No merge,
deployment, private notebook access or physical iPad acceptance occurred.
