# v78 media-gesture phase contrasts (diagnostic only)

## Question and prior evidence

At source `3f7079ccfd96c51495a1c091594ca6a9a86506fc`, CI
`37846632932` produced a matched-input contrast: Linux WebKit failed with
media movement plus undo (with and without early observations), but matched
the reference exactly when movement and undo were omitted. Opening and
closing the media panel remained in every variant. A/B had the same nine
different RGBA pixels; C/D had none. The separate original full gate remained
53/54 with a different 13-pixel mask. Neither is a proven product fix.

The next experiment isolates selection and cancelled movement preview, before
committed movement and undo. Early measurements are retained throughout.

## Four histories

| Variant | Gesture between opening and closing the media panel |
| --- | --- |
| A | Original pointer down/move/up, followed by real UI undo |
| C | No pointer gesture or undo |
| S | Pointer down/up at the same coordinates; selection only |
| P | Pointer down/move/cancel; movement preview is cancelled |

The final text must remain at its original position through actual application
handlers, not by assigning model coordinates. P is not an equivalent way of
completing a move: cancellation skips the pointer-up handler's final preview
update and commit. That lifecycle difference is part of the intervention.

Why selection matters: `startMediaGesture` sets `mediaGesture` even before a
move. The slide renderer then draws the active row directly and discards its
cached tiles. Final JSON content alone does not capture that history.

Why deep-clone claims are premature: media undo restores a shallow snapshot
of the strokes array. Existing pen stroke/point objects are preserved; only
the selected media draft is cloned when a transformation commits. Revision,
array identity, cache state, queued saves and timing remain possible mediators.

## Evidence and validity

- Fresh selected-case processes for both Chromium and WebKit at DPR 2: eight
  observations, not a replacement for the original full 54-case acceptance.
- The terminal raster oracle, early pixel/ROI checks and quality limits stay
  unchanged. Terminal results are retained before cold replay or zoom.
- The actual gesture start, movement/cancellation, commit/undo distinction and
  final cleanup must be evidenced. Missing or contradictory state evidence
  is a harness failure, not a successful pixel comparison.
- No extra raster draws, pixel reads, waits or layout measurements are added
  to obtain gesture evidence. Minimal JavaScript state recording is still
  instrumentation and may affect timing; A must reproduce with it present.
- Ordered final ink, geometry and transforms must match across A/C/S/P.
  Random top-level page IDs are excluded; revision/cache differences remain
  visible rather than normalized away.
- A must fail and C must pass in the same engine/run before treating S/P as
  narrowing this known contrast. Otherwise the result is inconclusive.

Interpretation remains bounded. S failing would show that full movement and
undo are not necessary in this case; P alone failing would implicate preview
history. Both passing leaves committed movement/undo and their intermediate
work unresolved. None establishes a browser mechanism or physical-device
acceptance on its own.

## Execution boundaries

Only new diagnostic/test/document files and a failure-only CI step change.
Original application files, canonical acceptance runner, previous diagnostic
driver and 246-asset manifest remain pinned. Generated copies and proof files
stay in ignored output folders. No deployment, merge, account, live notebook,
paid model or real presentation is involved. `releaseEligible` stays false.

```sh
node --test work/test-ink-gesture.cjs
node work/diagnose-ink-gesture.cjs
```

The workflow collects `outputs/ink-gesture-diagnostic/` and the unchanged
`outputs/slide-flow/` image/report root. Results will distinguish the new
selected-case experiment from the original mandatory gate.

## Results

Windows local run `20261009045824586` completed all eight selected cases.
All terminal actual/reference comparisons were zero; final ink and geometry
hashes matched. Metadata validated the actual A/C/S/P event sequences, with
respectively 11/3/7/9 recorded phases per engine. Selection and cancelled
preview preserved the original list/stroke/point references and saved model.

Both A controls did not reproduce, so the result is correctly
`inconclusive-A-did-not-reproduce`, not a fix or an explanation of the Linux
failure. Node 24.13.0, Playwright 1.62.1. Local result SHA-256:
`5ddb8ee362c8163ebde46cf51d73605641e7d33f799f66ff755111ed2f3bb914`.

All 13 new pure guards and 16 previous history guards passed (29/29). During
pre-measurement review, diagnostic-only bug #2328 was found and fixed: an
unrelated save/runtime/early/zoom failure must not be called a clean terminal
contrast. Negative tests now reject these failures and revalidate raw gesture
records rather than trusting a `valid` flag. This was not a live-app bug.

Canonical application, original runner, history helper and all 246 package
assets remained unchanged. Same-source Linux results are pending and must be
reported separately from the original mandatory gate.
