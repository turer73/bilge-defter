# v78 one versus two commits at the same endpoint

## Question and frozen baseline

At source `10c7fcf13cf15ece99d8f6868c3a1a6645dbc996`, CI37956707424
showed the same13 differing Linux WebKit pixels in the undo path A and the
no-undo return-drag path R. UI undo execution therefore was not necessary for
that observation. The original mandatory gate remained53/54 with a different
nine-pixel mask. No shared cause or application fix was established.

This bounded follow-on tests whether the same discrepancy can occur without
returning the moved item to its initial position. It compares real actions,
never direct model assignment, coordinate rounding or fabricated undo records.

| Variant | Real action path | Intended final text point |
| --- | --- | --- |
| A | Frozen control: move, commit, UI undo, close | (300,320) |
| M | Frozen one-commit endpoint control: move, commit, close | (340,345) |
| T | Two committed drags, then close, without returning to start | Same exact raw point as M |

## Validity requirements

- Freeze A and M copied-runner bytes, canonical runner, old helpers, application
  and all246 generated release assets. Keep the complete measured audit body and
  numerical quality loop unchanged.
- Verify both real T gestures, first-clone selection by the second gesture,
  actual intermediate draft movement, two commits and two new object identities.
  Require two undo entries and revision/edit-revision deltas2, not a disguised
  undo. M has one entry/delta1. Unselected stroke/point identities stay unchanged.
- Require exact M/T final measured visible content and closed geometry. Live
  drafts and the first T commit permit narrowly bounded pointer arithmetic.
  Frozen M retains its original nominal-coordinate check within1e-9, so compare
  T to M's actual raw result, not a rounded nominal target. Final M/T differences,
  however tiny, must reject equivalence; do not round or snap them.
- Bind final measured content to the raw terminal event and recompute hashes.
  Keep A's different selected text coordinates explicit, while checking all
  remaining ink is unchanged. Random page IDs may be normalized by row order;
  numeric geometry, stroke values and ordering must not be approximated.
- Measure fresh A reproduction and fresh M quality in the same experiment.
  A not reproducing, M no longer clean, unequal final M/T model/geometry or an
  unrelated fixture failure prevents the intended contrast from being decisive.
  Preserve every actual metric and failure rather than claiming a pass.
- No extra hot pixel readback, screenshot, layout probe or observer-only browser
  turn. Added pointer events and bounded metadata are interventions and must be
  described. Stop T at the terminal audit; preserve error/report/teardown paths.

## Interpretation limits

If A reproduces, M remains clean and T fails with exact M/T final content, return
to the initial position is not necessary for T's observed failure. This still
does not prove that commit count alone causes the defect: gesture sequence,
intermediate content, painting, revisions, object/reference retention and timing
all differ. Both commits still use undo storage even though UI undo is not run.

If T matches its reference, that result does not prove return-to-start causes R.
Separate contexts and differing histories remain confounders. If fresh M fails,
retain its mask and report that the previously clean comparison is not clean
in this run. Do not substitute past measurements for fresh controls.

The inherited audit waits two animation frames and performs four draws before
readback; it does not observe the first native frame after input. Only measured
visible ink is compared fully; hidden rows have bounded identity/count guards.
T's first committed clone may be retained by the observer while frozen M does
not retain that extra object. No physical iPad or live notebook is tested.

## Execution and ownership

```sh
node --test work/test-ink-two-commit.cjs
node work/diagnose-ink-two-commit.cjs
```

Root owns all execution, Git/CI and ignored evidence under
`outputs/ink-two-commit-diagnostic/`. The driver and pure-test authors do not run
browser or remote measurements. An independent reviewer reads source and the
result ledger. No application change, threshold relaxation, merge or deploy is
part of this work. Diagnostic success never overrides the original release gate.

## Local results and pending Linux measurement

The final split path is client(330,330)→(350,340), then(350,340)→(370,355),
using the original measured scale. T's first committed model point is(320,330);
its final point is exactly(340,345), the same raw result as M. Two real gesture
records select and replace the correct clone. No final coordinate rounding occurs.

65 pure guards passed (53 existing plus12 new). The new tests include wrong
second target, missing preview/commit, actual undo substitution, unrelated
failures, a failing fresh M, and coherent event/model/hash metadata with a
5e-10 final difference that must remain inconclusive. The VM runs pinned real
handlers but injects the selected target and mocks bounds constraints; browser
records separately verify actual hit selection.

Windows run `20261009173932690` completed6/6 clean observations in Chromium and
WebKit. A did not reproduce, so neither engine permits a causal interpretation.
Both M/T final models and all closed geometries match exactly; A11/M9/T15 real
records, M undoDepth1/revision1 and T undoDepth2/revision2. All prior source and
246-asset pins stayed unchanged. Node24.13.0, Playwright1.62.1.

- Driver SHA `61c4e18d8cf4f56f457c042ee325677ff440708f4e45bf8a6da3f419f18543d1`.
- Test SHA `40fe1977e9450012d1abe309dc902e94095e5d4e058868d805086de07dd9f6fe`.
- Result SHA `49571ab8da7a0055f6f167039be3152fcd215d7596723fab4da1f7bf14387a68`.
- Independent read-only source review found no blocking issue; clone retention,
  timing and gesture/history confounders remain explicitly documented above.

Same-source Linux CI is still required. Local clean results are not an application
fix or a substitute for the unchanged mandatory acceptance gate.
