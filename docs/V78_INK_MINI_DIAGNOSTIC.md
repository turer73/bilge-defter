# Standalone Canvas2D reduction (diagnostic only)

## Purpose and boundary

The original Linux/WebKit DPR-2 gate remains mandatory. At baseline
`970576fc5b7d84e776d657a1baba3b36a24530a7`, CI `37838275299` reported
53/54 both with the original application and an isolated final-geometry
media-close candidate. Removing the intermediate old-geometry redraw did not
remove the raster discrepancy. That candidate was not adopted.

This experiment asks a narrower question: can a discrepancy be observed with
the same ink primitive and final geometry, without loading the application?
It neither fixes the product nor establishes the browser's internal cause.
`releaseEligible` is always false. A `no-repro` result means only that these
reduced examples did not reproduce a difference. It cannot close bug #2300.

No canonical application, original acceptance runner, quality threshold,
release manifest, account, notebook, production service or deployment is
changed. CI runs this only after the original mandatory DPR-2 gate fails;
it cannot turn that failed gate green. No paid model or real document is used.

## Pinned inputs

The harness extracts the actual `drawStroke` function and its small helper
dependencies from the pinned source. In particular, a pen's first-point
`arc`/`fill` and subsequent round-cap segment `stroke` are separate commands;
they must not be replaced with a supposedly equivalent simplified path.

The source fixture generator supplies synthetic strokes: width 3, pressure
0.5, and original color/tool/order rules. Exact binary-number inputs are
serialized without recomputing scale or translation through another formula.
The final physical bitmap is 1676 by 1318. The second-row transform is
`[1.6759999999999999, 0, 0, 1.6759999999999999, 0, 983.81200000000001]`,
with logical clip `[0, 0, 1000, 563]`.

Both bounded data sets run; neither is selected opportunistically after a
result:

- `tiny3`: pen indices 27, 51 and 57, also used for the first-row precursor.
- `expanded200`: ordered first-row indices 0 through 219, then ordered
  second-row indices 0 through 199, including the original marker rule.

Omitted: text, images, eraser/edit operations, full earlier warm-up history,
DOM media-panel layout, MutationObserver timing, application state, DB,
PowerPoint/PDF parsing and application scheduling. A failure in this reduction
would still need comparison with the original failure's stage and pixels.

## Four comparisons

Each data set/variant runs in a fresh context at DPR 2 for each browser.
All comparisons are within one engine, not Chromium versus WebKit equality.
Each actual is compared with an independent fresh direct-drawing reference.

| Variant | Final drawing path | Changed factor |
| --- | --- | --- |
| A | Direct canvas drawing | Minimal direct-render baseline |
| B | Fresh scratch for each row, integer tile copies, final canvas | Copy chain |
| C | Same as B but scratch cleared and reused between rows | Scratch reuse |
| D | Same as C, with final/old/final bitmap history on the output | Output resize history |

D includes a synthetic old-size drawing, not a faithful replay of the old
application frame. The scratch starts at the final size; the experiment does
not incorrectly claim the application's scratch was resized.

No pixel read, screenshot, WebGL backend query or `willReadFrequently` hint is
inserted into the hot drawing sequence. Scratch disposal is consistent across
tile variants. Readback and PNG serialization occur after drawing. Evidence
includes the payload/provenance, surface size generations, hashes, non-empty
checks and raw RGBA/alpha/white-composited difference measurements. A mismatch
is an observation, not an assertion that ink is missing or stale.

## Execution and evidence

Run the pure harness controls first:

```sh
node --test work/test-ink-mini.cjs
node work/diagnose-ink-mini.cjs
```

The generated standalone HTML and JSON/PNG evidence live under the ignored
`outputs/ink-mini-diagnostic/` directory. The CI artifact preserves that
directory beside the original runner's independent output.

Source and fixture mutation controls must reject altered inputs. Comparator
controls must detect a known one-channel change. Empty output is an invalid
measurement, not a successful match. Browser/harness errors must remain
errors, not `no-repro`.

## Result record

Windows preflight: 19/19 pure controls passed. The 16 requested browser cases
completed with identical raw RGBA within each actual/reference pair; none
exceeded the original descriptive envelope. This is `no-repro`, not a fix.

- Report: `outputs/ink-mini-diagnostic/20261008204938062/results.json`
- Report SHA256: `8b02358d8c0f6ec04cb61a94bb9737248b9b0018b0741f55bb0e785f60142cc7`
- Harness SHA256: `df069411d8770a2f963547e6e80e511115627dbac025930065446e562373532d`
- Pure-controls SHA256: `365ef0895d1cb05a22f0699f995c290a810712dd4bc406fba529ff63aa4cd264`

Linux results are pending at this commit. Local evidence is not a substitute
for the same-source Linux check, and neither is physical iPad acceptance.
Record each platform's results, commit and original gate result separately;
do not reinterpret an unobserved discrepancy as a product fix.
