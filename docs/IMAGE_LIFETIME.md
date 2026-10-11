# Discarded image lifetime (local candidate)

This is a narrow follow-up to `IMPORT_ASSETS.md`, not ref-only runtime loading.
The notebook, trash, and asset registry still contain encoded image strings.

## Changes

- A confirmed permanent page deletion discards that page's inaccessible media
  undo history. Moving a page into the trash, cancelling deletion, and restoring
  a page preserve its undo history. Other pages are unaffected.
- Closing the trash dialog clears its old cards and their page-capturing event
  handlers. A queued close event must not empty a dialog that has reopened.
- Restoring the pre-import copy asks for consent before reading and hydrating
  the previous notebook. Cancelling therefore does not populate the asset
  registry with images from a notebook that was never opened.

No disk asset deletion, backup format, schema, image-quality or file/page-limit
change is part of this step. Existing previous-copy and seven-day asset cleanup
rules remain in place. The independent JSON backup remains self-contained.

## Verification

`npm run test:image-lifetime` uses fresh local Chromium and WebKit contexts,
synthetic images and the real notebook lifecycle. Tests inspect map entries,
hidden DOM cards, storage operations, and successful restore/reload behavior.
The same targeted tests are also run against the frozen pre-fix source.

These are reachability/lifecycle assertions, not measurements of browser heap,
RSS, garbage collection timing, or physical iPad responsiveness. Source hashes,
negative controls, selected regressions and limitations belong in the immutable
run report under `outputs/image-lifetime-20261011` before acceptance.

Live rollout and physical-device acceptance remain separate gates.
