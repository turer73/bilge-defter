# v78 list replacement timing around media close

## Question and fixed scope

Baseline `e76edf4ba8a9e5e6f877d4224de06860bde5e006`, prior result note102443,
Linux run37974446932 attempt1. The prior synthetic stamp contrast reproduced
the same13-pixel WebKit discrepancy by shallow-list replacement or page revision
alone. The original mandatory gate remained53/54. This did not establish a
browser mechanism, stale-tile reuse, or a production correction.

Existing traces also showed223 extra drawStroke calls and15 scratch-to-tile
copies at the old2260x1482 size in the mutated cells. Sham/M did not rebuild in
that close phase. All then rebuilt at1676x1318. Extra earlier work is a plausible
mediator, not a proven cause. The older candidate's identical measured source
map failed53/54 in one run and passed54/54 in another; retain both outcomes.

This bounded diagnostic compares the same shallow-list assignment before versus
immediately after the real cancelMediaMode returns, inside the already existing
close evaluate. It does not change application assets. A balanced sham must
share observation, allocation and retention work, without the assignment.

Fresh A/M/T retain their preceding complete generated-runner bytes. New S/E/L
cells use the same observer with four checkpoints: initial, beforeClose,
afterClose and final. E assigns between initial and beforeClose; L assigns
between the real close return (afterClose) and final; S never assigns. These
are new balanced cells, not byte-identical copies of the prior S00/L10.
The common afterClose snapshot runs between the function return and late
assignment: same synchronous browser turn does not mean zero intervening CPU
work. That observation overhead is present in all three cells.

## Required evidence

- Keep canonical audit body, numeric quality thresholds, application package,
 246 assets and prior diagnostic helpers pinned. Fresh unmodified controls must
 run alongside the new cases; local clean results are not Linux reproduction.
- No additional input event, browser evaluate, wait, animation frame, rendering,
 layout query or hot-path pixel read. The real close function must still run.
- Exactly one shallow copy allocated in each timing cell. No touchPage,
 scheduleSave, ink edits, undo changes or hidden revision increment.
- Observe actual pre/post values and identities with bounded retained snapshots.
 The real close must clear selection/gesture state; never fabricate that cleanup
 or normalize away an unexpected transition to make validation pass.
- Final raw model and closed geometry must equal the single-commit control
 exactly, including small internally coherent coordinate differences. Bind
 receipts to the actual measured endpoint and absolute page revisions.
- Inspect the recorded rendering work: early must rebuild at the old size,
 sham/late must not, and all must rebuild at the new size. Missing, dropped or
 contradictory trace makes attribution invalid, not a successful experiment.
- Interpret a timing contrast only with clean balanced sham, a fresh reproducing
 early cell and real reproducing controls. Preserve every observation even if
 these controls fail. Runtime errors and unrelated early-stage failures cannot
 be relabelled as the target raster discrepancy.

## Limits and next acceptance boundary

Moving an assignment also changes ordering and timing. A clean late case would
support this narrower intervention, not prove the renderer's internal mechanism
or the fix for actual edits. The inherited oracle waits two frames and performs
four draws; it does not measure the first native frame. Shared snapshots add
CPU/allocation work. A dirty sham prevents attribution.

The full mandatory gate stays independent. No diagnostic result authorizes
merge, deployment, live notebook changes or physical iPad acceptance. A future
correction needs a predeclared repeated paired Linux baseline/candidate check,
all unchanged acceptance gates and later real-device evidence; do not retry
until green or discard prior failures.

## Ownership and execution

CLAIM102446: driver author owns new `work/diagnose-ink-close-timing.cjs`, test
author owns new `work/test-ink-close-timing.cjs`. Root owns this document,
failure-only workflow wiring and ignored `outputs/ink-close-timing-diagnostic/`
proof. Root alone executes tests/browsers/Git/CI and writes result ledgers;
independent reviewers only inspect source and existing evidence.

```sh
node --test work/test-ink-close-timing.cjs
node work/diagnose-ink-close-timing.cjs
```

This document is the pre-measurement contract, not a claim of passing results.

## Preflight checks

The77 preceding pure guards passed unchanged before this experiment. The new
phase join was exercised read-only against four downloaded prior records:
Chromium/WebKit S00 and L10 from37974446932. It accepted their actual old/new
scratch dimensions, ordered strokes and tile copies. This is validation against
existing evidence, not a new early/late browser measurement.

Initial independent source review found two provenance-label collisions:
generic browserCallsAdded incorrectly overwrote inherited control counts, and
new cells inherited MByteExact despite a changed observer. Both metadata labels
were corrected before measurement; generated-runner bytes were unaffected.
The observer now reports its own added calls separately and distinguishes the
unchanged ancestral M from the fully transformed cell runner.

## First local observation, before final guard review

Windows run20261009191011239 used driver
`af584fdd3b171ab2fa2f7bd55195625ddb4e0a683540191cc3c7f550af2e5f61`.
All12 selected Chromium/WebKit cases had zero pixel differences; root separately
decoded24 PNGs and recomputed their metrics. A/T did not reproduce, therefore
both engines are inconclusive, not corrected. Final model/geometry matched and
recorded old-size rebuild was present only in E, absent in S/L; all rebuilt at
the final size. Result SHA
`8b41569781a85e1712ee32047ca0aa361b2207f1fab005724092bb31bba6c141`.

The first5 ready pure tests passed before that local observation; the additional
negative tests were still being authored. During their review, a provenance
guard gap was found: tile-to-main joins checked the source and dimensions in
the same phase, but not copy ordering or exact coordinates. Tightening this
post-processing validation does not change generated browser-runner bytes.
The initial result stays immutable and must be identified by its actual older
driver hash. Revalidation with the final guard is a separate post-hoc check;
it must never be relabelled as a fresh browser run.

Final pure suite passed91/91 (77 preceding +14 new), with no failed, skipped or
cancelled tests. The tightened guard requires write-before-read, equal backing
dimensions, safe integer bounds and the exact inverse copy rectangle, rejecting
even an in-bounds shift or crop. Final driver SHA
`b24b2de7eec430badec4d16699a465014803f4a12170b74e601b54535a226b2a`;
test SHA `32e544f05696f5bcb25b1086312bd797ff70b743262e6b7a0c0a99572505fb78`.

That final validator accepted the immutable local evidence in a separately
saved post-hoc check. All six regenerated full-runner hashes exactly matched
the ones actually used in the local run. No second local browser run was made.
The guard defect is diagnostic2350; original product2300 remains open.
