# v78 commit/undo endpoint diagnostic (not a release)

## Question

CI 37886475471 at source 1f20e3d reproduced the same nine-pixel Linux WebKit
discrepancy after committed media movement plus UI undo. Selection alone and
movement preview followed by cancellation matched the reference. Every final
model and geometry matched, but commit, undo, revision/list identity, saves,
render history and timing were not separated. The original gate was 53/54.

This experiment asks where the first measured divergence is observable. It
does not assume that undo, resize, or the cache implementation is defective.

## Independent contexts

| Variant | Endpoint |
| --- | --- |
| A | Previous exact reproducing move/commit/undo/close control |
| O | Media panel opened, no edit |
| K | Real pointer-up committed movement, panel still open |
| U | Real UI undo after movement, panel still open |
| M | Committed movement and panel close, no undo |

Each variant uses a fresh browser context/process history. Existing initial,
pen and eraser measurements remain. O/K/U/M end after their chosen terminal
audit: no later undo, close, cold replay, zoom, save wait or screenshot. Existing
post-measurement metadata serialization and teardown are permitted. A remains
the exact prior copied control, including its original diagnostic/zoom tail;
its original warm terminal result alone establishes reproduction.

The measured raster body and numerical quality thresholds are unchanged.
The endpoint wrappers, event cutoffs and labels are intentionally different;
the entire experiment is not claimed to be the original acceptance suite.
Metadata must come from real events, never fabricated panel-close records.

## Reference validity

The selection outline and handles are DOM overlays, not ink canvas drawing.
At each endpoint the actual gesture and pending draft must have ended. The
stored model is then a valid reference input. Every actual image is compared
with its own model, bitmap size, CSS size, DPR and transforms. An open panel
may have a different canvas size from a closed panel; cross-size equality is
not required or invented.

- O/K/U must share their open-panel geometry; M/A their closed geometry.
- O/U and U/A retain original text coordinates (300,320).
- K/M retain the real committed coordinates around (340,345), allowing only
  1e-9 floating-point arithmetic residue. Their recorded raw coordinates must
  match each other exactly; coordinates are not rounded in evidence. The
  original restored coordinates remain exact. This metadata tolerance does
  not change any pixel-quality threshold.
- Before allowing a pairwise content comparison, validate that exactly the
  active row's one selected text target changed those coordinates; every
  other ordered stroke, point, pressure, style and text field must match.
- Revision, shallow-array identity, undo depth and selection state remain
  visible in evidence; they are not normalized into a claim of equal history.
- A must reproduce in the same engine/run before drawing conclusions about
  the known failure. Nonterminal or unrelated failures invalidate a case.

O guards against calling a pre-existing open-panel discrepancy a commit bug.
K versus U probes the commit/undo boundary; K versus M and U versus A probe
panel closure after different edit histories. These are endpoint contrasts,
not proof of a browser backend mechanism. Delays induced by measurement and
the original audit's warm redraws remain limitations.

## Boundaries and execution

Only the new diagnostic, pure tests, this document and a failure-only CI step
change. Application files, prior drivers, canonical acceptance runner and the
246-asset package remain pinned. The full mandatory gate runs separately.
No deployment, merge, account, real notes, paid model or physical-device
acceptance is included. `releaseEligible` remains false.

```sh
node --test work/test-ink-endpoint.cjs
node work/diagnose-ink-endpoint.cjs
```

Results are recorded under ignored `outputs/ink-endpoint-diagnostic/`, with
copied-runner images and traces in `outputs/slide-flow/`. Same-source Linux
evidence is required; a Windows control that does not reproduce is inconclusive.

## Results

Pre-browser pure tests caught an unclosed inherited action wrapper in a cut
runner and overly strict floating-point coordinate guards (340.00000000000006
versus 340). Review also found an inherited failure-handler screenshot after
the terminal measurement. These are diagnostic-only implementation issues,
tracked as #2338, not live application defects. Full generated-runner parsing,
real-handler VM events and failure-handler checks cover the corrections.

Final pure tests: 12 endpoint guards plus 29 prior guards passed (41/41).
The first draft runs (3/6, then 8/12 and 11/12) are superseded by the corrected
run, not concealed as successful measurements. Independent read-only source
review found no remaining blocker.

Windows run `20261009064800380` completed all ten observations with zero
terminal difference and valid raw lifecycles. O/K/U used bitmap2260x1482;
M/A used1676x1318. Expected model differences and each within-group geometry
comparison passed. Both A controls did not reproduce, so this is
`inconclusive-A-did-not-reproduce`, not a fix. Node24.13.0, Playwright1.62.1.
Local result SHA256:
`da8bca489d15e90a553ce4cf4870ae6047526726ceac236967faaba66f4b4db3`.

Application, helpers, canonical runner and all246 package assets stayed
unchanged. Same-source Linux evidence remains pending; no publication claim
is made.
