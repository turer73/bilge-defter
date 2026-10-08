# v78 prior-history contrasts (diagnostic only)

## Question

At baseline `7fbfc483519bb7d2e5e93fbf79102afd3317e136`, CI `37842537707`
still failed the original WebKit/DPR2 media-undo raster gate: 53/54 cases,
nine differing pixels, maximum alpha difference 64 against the unchanged
limit of 32. The standalone Canvas2D reduction produced identical actual and
reference pixels in all 16 Linux and all 16 Windows comparisons. It did not
reproduce the application failure and established no root cause.

This next experiment uses copies of the original failing case, retaining the
application and its real synthetic pen/eraser/media event sequence. It changes
two pieces of prior history, not the application renderer.

## Bounded 2-by-2 design

| Variant | Early measurement package | Media move followed by undo |
| --- | --- | --- |
| A | Kept | Kept |
| B | Suppressed | Kept |
| C | Kept | Suppressed |
| D | Suppressed | Suppressed |

All variants keep opening and closing the media panel. C/D do not reset text
by writing its coordinates: they omit both pointer movement and the undo
operation, leaving the same intended final text content through normal UI
open/close. Revisions and cache activity may differ; these are observations,
not values to force into equality.

B/D suppress the full initial/pen/eraser pixel comparisons and PNG encodings
as well as the three small-region pixel probes. The early full audits' four
`drawAll` calls, independent reference drawing, reference disposal and frame
waits remain. Layout and ink metadata remain. Missing measurements are
explicitly marked unmeasured; they are not replaced by zero or passing values.
Imports still generate the same background PNGs; this is not a claim that the
whole application ran without any earlier canvas serialization.

Removing comparisons/PNG encoding also removes CPU work and its timing.
Therefore B/D intervene on the *early observation package*, not purely on a
single GPU readback mechanism.

Each variant runs in a fresh browser process/context for Chromium and WebKit
at DPR 2: eight selected-case observations. The canonical full 54-case gate
runs separately and is never replaced with these modified histories.

## Preserved oracle and comparisons

The terminal `media undo` audit keeps the original raster/reference code and
quality limits. Its primary result and final input metadata are retained
before the original cold-replay diagnostics and zoom step. No post-measurement
experiment is substituted for that primary result.

Comparability requires ordered final stroke data, bitmap/CSS size, DPR,
transform, row geometry, scale and scroll to agree. Random page identifiers
are excluded from cross-context comparisons. Revisions/cache counters are
retained separately, not treated as geometry or normalized to equal values.
Input/geometry mismatch makes a contrast inconclusive.

Variant A must reproduce the original failure for that engine before another
variant can give evidence of dependence on the changed history. If A does not
reproduce it, passing variants are not evidence of a fix or a causal finding.
Even a matched-input difference is a bounded observation, not an established
browser mechanism or physical iPad result.

## Source and execution boundaries

Only new diagnostic/test/document files and a failure-only CI step change.
Runner copies and proof files are generated under ignored output directories.
Canonical application, original runner, thresholds and 246-asset manifest are
hash-checked and remain unchanged. No account, live notebook, service,
deployment, merge, real presentation or paid model is involved.

```sh
node --test work/test-ink-history.cjs
node work/diagnose-ink-history.cjs
```

Evidence goes to `outputs/ink-history-diagnostic/`; the existing
`outputs/slide-flow/` artifact retains the copied runner's images and reports.
`releaseEligible` remains false for every outcome. Only the diagnostic
experiment can complete; bug #2300 and the release gate remain separate.

## Results

Local run `20261008212243065` (Windows, Node 24.13.0, Playwright 1.62.1):

- All 16 pure harness tests passed.
- All eight selected-case observations completed; terminal alpha and white
  composite maxima were zero in both engines for A/B/C/D.
- Final ordered ink and geometry hashes matched across all eight endpoints.
- Both controls A did **not** reproduce the failure. The diagnostic therefore
  reports `inconclusive-control-did-not-reproduce`, not a correction or causal
  result. The local result cannot replace the Linux mandatory gate.
- B/D retained three explicitly unmeasured audits and three unmeasured ROI
  probes each, rather than reporting those omissions as passing pixel checks.
- The canonical runner and all 246 application asset hashes remained pinned.

Local results SHA-256:
`a19d5c2dae716c129a26b268f23557dbdb9ae0eb7227274b5327c39e0395c5f9`.
Linux results are pending. Keep the separate original mandatory gate in the
same-source report without mixing different runs' pixel counts.
