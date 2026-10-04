# v73 PowerPoint pilot release

## Scope

- PPTX, at most 20 MiB and 50 slides, with explicit upload consent.
- Source files are validated before conversion. Macros, OLE, external resources
  and external workbook links remain rejected. Plain text source citations in
  slides/notes are preserved without fetching their destinations.
- The existing LibreOffice dependency image runs a dedicated bounded subprocess
  worker over a Unix socket. No Java, unoconvert retry, persistent UNO service,
  public port, outbound network, account data or credentials in the worker.
- One conversion at a time, 45-second process limit, whole-group cleanup,
  per-job temporary profile, maximum macro security, bounded RAM/CPU/PIDs/tmpfs.
- Auth, student approvals, dictionaries, library, note storage and sync schemas
  are unchanged. API remains a single process.

## Publication boundary

This document initially records the candidate. A release is live only when
`/opt/bilge-defter-classroom-v73/live-proof.json` exists and independent origin
verification agrees. Local/CI tests are not a physical iPad test.

Required sequence: committed source, build receipt, prepare and account DB
snapshot, off-host copy verification, worker tests and conversion acceptance,
real nginx plus synthetic authenticated account acceptance, rollback rehearsal,
activation, origin checks. No real account impersonation or note inspection.

`work/build-release-v73.py` packages a single commit. `work/prepare-v73.py`
builds/tests the worker. `work/deploy-v73.py` controls the combined web/API
release. The worker's UDS mount is read-only in accounts. No Docker socket is
mounted anywhere.

## Rollback

Run `sudo python3 -B /opt/bilge-defter-classroom-v73/deploy-v73.py rollback`.
This restores retained (or snapshot-recreated) web v72 and accounts v68;
it does not restore an old database over newer notes. The isolated worker can
remain running but the prior API has no socket mount and cannot use it.
Never roll notebook storage back below v70.

## Honest limits

This is a PDF import, not an editable PowerPoint editor. Animations, transitions
and speaker notes do not become notebook content. Keep the source PPTX for
attributions stored in notes. Fonts may be substituted; no licensed Microsoft
fonts were copied. The public Lumen fixture and synthetic chart can establish
conversion behavior, not universal layout fidelity or medical correctness.
Review the preview before adding it to a notebook. Physical iPad/Pencil
acceptance is performed separately by the user.
