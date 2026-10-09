# v78 same-content return gesture diagnostic

## Purpose and frozen baseline

At source `8b6522ab067a247d14b2cbde45be4dcec26c1abb`, CI37895846926
reproduced nine differing Linux WebKit pixels only after moving, committing,
using real UI undo, and closing the media panel (A). Open-only, committed-open,
undone-open and committed-close observations matched their own references.
The original mandatory acceptance gate remained53/54. No cause or fix was proven.

This experiment compares two ways to reach the same visible content and closed
geometry. It does not change product code or relax any acceptance criterion.

| Variant | Real action path |
| --- | --- |
| A | Frozen prior control: open, move/commit, UI undo, close |
| R | Open, move/commit, reverse move/commit, close; no undo |

R reverses the original pointer coordinate pair through the actual event path.
No direct model restoration, rounding, fake undo, or synthetic close record is
permitted. A remains byte-exact to the previous copied A including its original
tail. R stops after its terminal quality audit, retaining error metadata and
teardown but omitting later cold replay, zoom, save-wait and screenshots.

## Validity gates

1. Pin the canonical runner, old diagnostic helpers and all246 release assets.
2. Preserve the complete measured raster body and numerical assertion loop.
3. Validate raw real pointer events, target identity, actual preview movement,
   commits, undo depth, revision deltas, pending state and panel closure.
4. A restores original stroke/point references through a different shallow
   array; R should retain a twice-replaced selected text object and two undo
   entries. Unselected stroke and point references must remain unchanged.
5. Exact final ordered visible ink and closed geometry must agree with A.
   This includes the returned text point at exactly(300,320), without rounding
   or a final-position tolerance. Floating-point drift makes the comparison
   inconclusive, not an approximate same-content success.
6. Bind measured content to the raw observed final event. Recompute reported
   hashes. Reject missing metadata, unrelated failures or altered prior phases.
7. Interpret the Linux contrast only if its exact A control reproduces in the
   same run. A clean Windows result remains inconclusive.

Use independent contexts, not serial measurements which alter the same warm
context. Existing initial/pen/eraser audits are retained. Terminal sampling still
waits two frames and performs the original four draws; it is not the first native
frame after an input event. Observer work and additional R events alter timing.
Relative to A, the hot media path gains three reverse-pointer calls and omits
the undo click and its restored-position query: net one extra browser turn.
There is no additional turn solely for the observer. Inherited observer/action
hashes identify the ancestral canonical blocks; the full copied-runner hash
binds the actual transformed observer and action code.

## Interpretation limits

- Equal content/geometry does not mean equal history: A and R differ in gesture
  count, undo stack, selected-object identity, drawing calls and timing.
- R's observer retains the first committed clone until close so it can verify
  the second clone. A's frozen observer does not retain this extra reference;
  different observer/reference-retention history is another limitation.
- A fails/R passes narrows the history contrast but is not proof that the undo
  implementation is defective. Both failing likewise does not prove a shared
  browser mechanism. Different failure masks must be retained, not combined.
- Only measured visible ink is compared fully; hidden rows have bounded
  reference/count guards. No real notebooks or physical-device acceptance.
- Diagnostics do not replace the strict full suite. No merge or deployment
  is included, and `releaseEligible` remains false for every result.

## Execution and evidence

```sh
node --test work/test-ink-return.cjs
node work/diagnose-ink-return.cjs
```

Root owns all test/browser/Git/CI execution and ignored evidence under
`outputs/ink-return-diagnostic/`. A separate reviewer reads the source and
evidence without duplicating measurements. The prior helpers, application,
canonical acceptance runner and release manifest are read-only.

## Local results

53 pure guards passed (41 prior plus12 new), including missing second gesture,
undo substituted for the second commit, forged metadata and tiny final-coordinate
drift. The VM exercises pinned gesture handlers but injects the selected target
and mocks bounds constraint; actual browser records verify real selection.

Two Windows runs completed4/4 observations with exact shared final ink/geometry
and zero pixel differences. A did not reproduce in either engine: inconclusive,
not a fix. After clarifying ancestral provenance hash labels, the final driver
was rerun; copied browser-runner bytes remained unchanged. Final evidence:

- Run `20261009160514007`; Node24.13.0 and Playwright1.62.1.
- Driver SHA `3e00236ed6a9a87df98c372e7e80196dddfef740caee3ecb6986f3f6faaeb316`.
- Results SHA `ff92082c4a73caad76c4185338a157f08624d4625f3d096cd2278493d108e428`.
- A11 real event records, R15; A undoDepth0, R undoDepth2; both revision delta2.
- Independent source review found no blocking issue; its observer-retention
  caveat is retained above. Application, helpers and246 package assets unchanged.

Same-source Linux CI evidence remains pending. No release claim is made.
