"""Synthetic documents/identities and mocked transport; no live converter used."""
import asyncio
import io
import struct
import threading
from types import SimpleNamespace
import zipfile

import httpx
import pytest

from app.api import bilge_defter_pdf as ppt
from test_accounts_cas import env, approved, headers, owner_headers, BASE

PATH = BASE + "/pdf-tools/convert"
STATUS = BASE + "/pdf-tools/status"
PDF = b"%PDF-1.4\nsynthetic-contract-result\n%%EOF"
TYPES = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Override PartName="/ppt/presentation.xml" ContentType="' + ppt.MAIN_TYPE + '"/></Types>')
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def presentation(slides=1):
    return ('<p:presentation xmlns:p="' + ppt.PRESENTATION_NS + '" xmlns:r="' + REL_NS + '">'
            '<p:sldIdLst>' + ''.join('<p:sldId id="' + str(256 + i) + '" r:id="rId' + str(i + 1) + '"/>'
                                     for i in range(slides)) + '</p:sldIdLst></p:presentation>')


PRESENTATION = presentation()


def deck(extra=None, replace=None, compression=zipfile.ZIP_STORED, slides=1):
    parts = {"[Content_Types].xml": TYPES, "ppt/presentation.xml": presentation(slides),
             "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL_NS + '/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
             "ppt/_rels/presentation.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(
                 '<Relationship Id="rId' + str(i + 1) + '" Type="' + REL_NS + '/slide" Target="slides/slide' + str(i + 1) + '.xml"/>'
                 for i in range(slides)) + '</Relationships>'}
    for i in range(slides):
        parts['ppt/slides/slide' + str(i + 1) + '.xml'] = '<p:sld xmlns:p="' + ppt.PRESENTATION_NS + '"/>'
    parts.update(replace or {})
    parts.update(extra or {})
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", compression=compression) as archive:
        for name, body in parts.items():
            archive.writestr(name, body)
    raw = result.getvalue()
    # Windows ZipInfo normalizes backslashes while writing; preserve the malicious
    # raw names in both local/central headers so the test exercises an actual ZIP.
    for name in parts:
        if "\\" in name:
            raw = raw.replace(name.replace("\\", "/").encode(), name.encode())
    return raw


@pytest.fixture
def setup(env, monkeypatch):
    env[0].app.include_router(ppt.router)
    for key in ("BILGE_DEFTER_PDF_ENABLED", "BILGE_DEFTER_PDF_USAGE_VERIFIED", "BILGE_DEFTER_PDF_ISOLATION_VERIFIED"):
        monkeypatch.setenv(key, "1")
    monkeypatch.setenv("BILGE_DEFTER_PDF_URL", "http://stirling-pdf:8080")
    monkeypatch.setenv("BILGE_DEFTER_PDF_API_KEY", "synthetic-worker-key")
    monkeypatch.setattr(ppt, "_worker_uncertain", False)
    state = {"calls": [], "status": 200, "body": PDF, "type": "application/pdf", "error": None,
             "encoding": "identity", "stream": None}
    def handler(request):
        state["calls"].append(request)
        if state["error"]:
            raise state["error"]
        stream = state["stream"] if state["stream"] is not None else httpx.ByteStream(state["body"])
        return httpx.Response(state["status"], stream=stream, headers={
            "Content-Type": state["type"], "Content-Encoding": state["encoding"]})
    real = httpx.AsyncClient
    monkeypatch.setattr(ppt.httpx, "AsyncClient", lambda **kwargs:
                        real(transport=httpx.MockTransport(handler), **kwargs))
    h = {**approved(env), "Content-Type": ppt.PPTX, "X-Bilge-Pdf-Consent": "1"}
    return env[0], h, state


def test_valid_pptx_and_no_identity_forwarding(setup):
    client, h, state = setup
    response = client.post(PATH, headers={**h, "Cookie": "private-cookie", "X-Filename": "private-name.pptx"}, content=deck())
    assert response.status_code == 200 and response.content == PDF
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.headers["X-Bilge-Pdf-Result"] == "converted"
    call = state["calls"][0]
    assert str(call.url) == "http://stirling-pdf:8080/api/v1/convert/file/pdf"
    assert call.headers["X-API-KEY"] == "synthetic-worker-key"
    assert call.headers["Accept-Encoding"] == "identity"
    assert b'filename="document.pptx"' in call.content
    for name in ("Cookie", "Cf-Access-Jwt-Assertion", "X-Bilge-Account", "X-Filename", "Origin"):
        assert name not in call.headers
    status = client.get(STATUS, headers=h).json()
    assert status["operations"] == ["convert"] and status["convert_input_types"] == [ppt.PPTX]
    assert status["upstream_verified"] is False and status["consent_required"] is True


@pytest.mark.parametrize("key", ["BILGE_DEFTER_PDF_ENABLED", "BILGE_DEFTER_PDF_USAGE_VERIFIED", "BILGE_DEFTER_PDF_ISOLATION_VERIFIED"])
def test_every_configuration_gate_is_required(setup, monkeypatch, key):
    client, h, state = setup
    monkeypatch.delenv(key)
    assert client.get(STATUS, headers=h).json()["configured"] is False
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert not state["calls"]


@pytest.mark.parametrize("url", ["http://example.com", "http://169.254.169.254", "http://stirling-pdf:8080/extra", "http://user@stirling-pdf:8080"])
def test_destination_is_fixed(setup, monkeypatch, url):
    client, h, state = setup
    monkeypatch.setenv("BILGE_DEFTER_PDF_URL", url)
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert not state["calls"]


@pytest.mark.parametrize("missing,code", [("Cf-Access-Jwt-Assertion", 401), ("X-Bilge-Account", 409),
                                          ("Origin", 403), ("X-Bilge-Request", 403), ("X-Bilge-Pdf-Consent", 400)])
def test_identity_origin_and_consent_before_upload(setup, missing, code):
    client, h, state = setup
    h.pop(missing)
    assert client.post(PATH, headers=h, content=deck()).status_code == code
    assert not state["calls"]


def test_pending_suspended_and_mismatched_accounts_denied(setup, env):
    client, h, state = setup
    pending = headers(env, email="pending@example.com")
    client.post(BASE + "/registration", headers=pending)
    assert client.post(PATH, headers=pending, content=deck()).status_code == 403
    assert client.post(PATH, headers={**h, "X-Bilge-Account": "other"}, content=deck()).status_code == 409
    client.post(BASE + "/admin/members/" + h["X-Bilge-Account"], headers=owner_headers(env), json={"status": "suspended"})
    assert client.post(PATH, headers=h, content=deck()).status_code == 403
    assert not state["calls"]


@pytest.mark.parametrize("media,body", [("application/vnd.ms-powerpoint", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"x" * 64),
                                       ("application/pdf", PDF), (ppt.PPTX, b"PK\x03\x04broken")])
def test_legacy_and_invalid_formats_not_uploaded(setup, media, body):
    client, h, state = setup
    assert client.post(PATH, headers={**h, "Content-Type": media}, content=body).status_code == 415
    assert not state["calls"]


@pytest.mark.parametrize("extra", [
    {"ppt/vbaProject.bin": b"macro"}, {"ppt/embeddings/oleObject1.bin": b"OLE"},
    {"ppt/activeX/activeX1.xml": "<x/>"}, {"ppt/media/image1.svg": '<svg/>'},
    {"../outside.xml": "<x/>"}, {"/absolute.xml": "<x/>"}, {"ppt\\bad.xml": "<x/>"},
    {"PPT/PRESENTATION.XML": PRESENTATION},
    {"ppt/_rels/presentation.xml.rels": '<Relationships><Relationship TargetMode="External" Target="https://example.com/a"/></Relationships>'},
    {"ppt/_rels/presentation.xml.rels": '<Relationships><Relationship Target="file:///etc/passwd"/></Relationships>'},
    {"ppt/slides/bad.xml": '<!DOCTYPE x [<!ENTITY a "bad">]><x>&a;</x>'},
    {"ppt/slides/bad.xml": '<!DOCTYPE x><x/>'.encode("utf-16")},
])
def test_active_external_or_unsafe_zip_parts_rejected_before_upload(setup, extra):
    client, h, state = setup
    assert client.post(PATH, headers=h, content=deck(extra)).status_code == 415
    assert not state["calls"]


@pytest.mark.parametrize("replace", [
    {"[Content_Types].xml": '<Types/>'}, {"ppt/presentation.xml": '<notPresentation/>'},
    {"[Content_Types].xml": TYPES.replace(ppt.MAIN_TYPE, "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml")},
])
def test_real_presentation_type_is_required(setup, replace):
    client, h, state = setup
    assert client.post(PATH, headers=h, content=deck(replace=replace)).status_code == 415
    assert not state["calls"]


@pytest.mark.parametrize("slides,code", [(0, 415), (1, 200), (50, 200), (51, 200), (100, 200), (101, 422)])
def test_slide_count_checked_before_conversion(setup, slides, code):
    client, h, state = setup
    response = client.post(PATH, headers=h, content=deck(slides=slides))
    assert response.status_code == code
    assert bool(state["calls"]) is (code == 200)
    if code == 422:
        assert response.json() == {"detail": {"code": "presentation_slide_limit",
                                             "max_slides": 100, "actual_slides": 101}}
    status = client.get(STATUS, headers=h).json()
    assert status["max_slides"] == 100 and status["max_input_bytes"] == 20 * 1024 * 1024


@pytest.mark.parametrize("mutation", ["bad_slide_node", "missing_list", "macro"])
def test_over_limit_malformed_or_unsafe_deck_is_still_generic_415(setup, mutation):
    client, h, state = setup
    extra, replace = {}, {}
    if mutation == "bad_slide_node":
        replace["ppt/presentation.xml"] = presentation(101).replace("<p:sldId ", "<p:invalidSlide ")
    elif mutation == "missing_list":
        replace["ppt/presentation.xml"] = '<p:presentation xmlns:p="' + ppt.PRESENTATION_NS + '"/>'
    else:
        extra["ppt/vbaProject.bin"] = b"private macro data"
    response = client.post(PATH, headers=h, content=deck(extra, replace, slides=101))
    assert response.status_code == 415
    assert isinstance(response.json()["detail"], str)
    assert not state["calls"]


@pytest.mark.parametrize("limit,value", [("MAX_FILES", 2), ("MAX_EXPANDED_BYTES", 20), ("MAX_ENTRY_BYTES", 20),
                                         ("MAX_XML_BYTES", 20), ("MAX_XML_TOTAL_BYTES", 20)])
def test_archive_limits(setup, monkeypatch, limit, value):
    client, h, state = setup
    monkeypatch.setattr(ppt, limit, value)
    assert client.post(PATH, headers=h, content=deck()).status_code == 415
    assert not state["calls"]


def test_zip_bomb_ratio_duplicate_symlink_and_crc(setup):
    client, h, state = setup
    bomb = deck({"ppt/media/large.bin": b"x" * 100000}, compression=zipfile.ZIP_DEFLATED)
    assert client.post(PATH, headers=h, content=bomb).status_code == 415
    for mutation in ("duplicate", "symlink", "crc", "count"):
        source = io.BytesIO(deck())
        if mutation in {"duplicate", "symlink"}:
            with zipfile.ZipFile(source, "a") as archive:
                if mutation == "duplicate":
                    with pytest.warns(UserWarning):
                        archive.writestr("ppt/presentation.xml", PRESENTATION)
                else:
                    entry = zipfile.ZipInfo("ppt/media/link")
                    entry.create_system = 3
                    entry.external_attr = 0o120777 << 16
                    archive.writestr(entry, "target")
            body = source.getvalue()
        else:
            body = bytearray(source.getvalue())
            if mutation == "crc":
                body[body.find(b"<Types")] ^= 1
            else:
                end = body.rfind(b"PK\x05\x06")
                struct.pack_into("<HH", body, end + 8, 65535, 65535)
            body = bytes(body)
        assert client.post(PATH, headers=h, content=body).status_code == 415
    assert not state["calls"]


def test_request_byte_limit_and_encoding(setup, monkeypatch):
    client, h, state = setup
    assert client.post(PATH, headers={**h, "Content-Encoding": "gzip"}, content=deck()).status_code == 415
    assert client.post(PATH, headers={**h, "Content-Length": "invalid"}, content=deck()).status_code == 400
    monkeypatch.setattr(ppt, "MAX_BYTES", 100)
    assert client.post(PATH, headers=h, content=deck()).status_code == 413
    assert client.post(PATH, headers={**h, "Content-Length": "2"}, content=deck()).status_code == 413
    assert not state["calls"]


@pytest.mark.parametrize("upstream,expected", [(302, 503), (400, 422), (401, 503), (403, 503),
                                            (413, 422), (422, 422), (429, 429), (500, 503), (503, 503)])
def test_completed_upstream_errors_are_redacted_and_allow_next_deck(setup, upstream, expected):
    client, h, state = setup
    state.update(status=upstream, body=b"Job failed:No PDF produced; private upstream detail")
    response = client.post(PATH, headers=h, content=deck())
    assert response.status_code == expected
    assert b"private upstream" not in response.content and b"No PDF produced" not in response.content
    assert not ppt._worker_uncertain
    state.update(status=200, body=PDF)
    response = client.post(PATH, headers=h, content=deck())
    assert response.status_code == 200 and response.content == PDF
    assert len(state["calls"]) == 2


@pytest.mark.parametrize("body,media", [(b"bad", "application/pdf"), (b"%PDF-truncated", "application/pdf"), (PDF, "text/html")])
def test_invalid_output_never_reaches_client(setup, body, media):
    client, h, state = setup
    state.update(body=body, type=media)
    assert client.post(PATH, headers=h, content=deck()).status_code == 502
    assert not ppt._worker_uncertain
    state.update(body=PDF, type="application/pdf")
    response = client.post(PATH, headers=h, content=deck())
    assert response.status_code == 200 and response.content == PDF
    assert len(state["calls"]) == 2


def test_oversized_output_blocked(setup):
    client, h, state = setup
    state["body"] = b"%PDF-" + b"x" * ppt.MAX_BYTES + b"%%EOF"
    assert client.post(PATH, headers=h, content=deck()).status_code == 502
    assert ppt._worker_uncertain
    state["body"] = PDF
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert len(state["calls"]) == 1


def test_completed_encoded_response_is_rejected_without_decoding_or_locking(setup):
    client, h, state = setup
    # Invalid gzip deliberately proves the response is bounded as raw bytes,
    # not decoded before the unsupported Content-Encoding is rejected.
    state.update(body=b"not gzip", encoding="gzip")
    assert client.post(PATH, headers=h, content=deck()).status_code == 502
    assert not ppt._worker_uncertain
    state.update(body=PDF, encoding="identity")
    assert client.post(PATH, headers=h, content=deck()).status_code == 200
    assert len(state["calls"]) == 2


def test_oversized_error_body_stops_reading_and_keeps_uncertain_worker_blocked(setup):
    client, h, state = setup
    read_chunks = []
    class OversizedBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            read_chunks.append(1)
            yield b"x" * 65536
            read_chunks.append(2)
            yield b"x"
            pytest.fail("oversized worker error body was drained past its limit")
    state.update(status=500, stream=OversizedBody())
    assert client.post(PATH, headers=h, content=deck()).status_code == 502
    assert read_chunks == [1, 2] and ppt._worker_uncertain
    state.update(status=200, stream=None, body=PDF)
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert len(state["calls"]) == 1


def test_single_slot_no_queue(setup):
    client, h, state = setup
    assert ppt._slot.acquire(blocking=False)
    try:
        assert client.post(PATH, headers=h, content=deck()).status_code == 429
        assert not state["calls"]
    finally:
        ppt._slot.release()


@pytest.mark.parametrize("error", [httpx.ReadTimeout("private"), httpx.ConnectError("private")])
def test_uncertain_upstream_fails_closed_not_assumed_canceled(setup, error):
    client, h, state = setup
    state["error"] = error
    assert client.post(PATH, headers=h, content=deck()).status_code in {503, 504}
    state["error"] = None
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert len(state["calls"]) == 1
    status = client.get(STATUS, headers=h).json()
    assert status["operations"] == [] and status["worker_state"] == "unknown"


@pytest.mark.parametrize("upstream", [200, 400, 429, 500])
@pytest.mark.parametrize("error,expected", [(httpx.ReadTimeout("private worker detail"), 504),
                                           (httpx.ReadError("private worker detail"), 503)])
def test_headers_with_interrupted_body_leave_remote_outcome_uncertain(setup, upstream, error, expected):
    client, h, state = setup
    class InterruptedBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"private worker detail"
            raise error
    state.update(status=upstream, stream=InterruptedBody())
    response = client.post(PATH, headers=h, content=deck())
    assert response.status_code == expected and b"private worker detail" not in response.content
    assert ppt._worker_uncertain
    state.update(status=200, stream=None, body=PDF)
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert len(state["calls"]) == 1


@pytest.mark.parametrize("upstream", [200, 400, 500])
def test_cancellation_during_response_body_keeps_next_deck_blocked(setup, monkeypatch, upstream):
    client, h, state = setup
    async def run():
        entered = asyncio.Event()
        class WaitingBody(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"private worker detail"
                entered.set()
                await asyncio.Future()
        async def read(*args):
            return deck()
        state.update(status=upstream, stream=WaitingBody())
        monkeypatch.setattr(ppt, "read_presentation", read)
        task = asyncio.create_task(ppt.convert(SimpleNamespace(headers={"x-bilge-pdf-consent": "1"})))
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert ppt._worker_uncertain
    asyncio.run(run())
    state.update(status=200, stream=None, body=PDF)
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert len(state["calls"]) == 1


def test_slow_upload_does_not_disable_converter_for_other_students(setup, monkeypatch):
    client, h, state = setup
    original = ppt.read_presentation
    async def slow_upload(*args):
        await asyncio.sleep(1)
    monkeypatch.setattr(ppt, "read_presentation", slow_upload)
    monkeypatch.setattr(ppt, "DEADLINE_SECONDS", .01)
    assert client.post(PATH, headers=h, content=deck()).status_code == 504
    assert not state["calls"] and not ppt._worker_uncertain
    assert client.get(STATUS, headers=h).json()["operations"] == ["convert"]
    monkeypatch.setattr(ppt, "read_presentation", original)
    monkeypatch.setattr(ppt, "DEADLINE_SECONDS", 90)
    assert client.post(PATH, headers=h, content=deck()).status_code == 200


def test_total_deadline_after_remote_attempt_opens_breaker(setup, monkeypatch):
    client, h, state = setup
    async def slow_remote(*args):
        state["calls"].append("remote-attempt")
        await asyncio.sleep(1)
    monkeypatch.setattr(ppt, "forward", slow_remote)
    monkeypatch.setattr(ppt, "DEADLINE_SECONDS", .05)
    assert client.post(PATH, headers=h, content=deck()).status_code == 504
    assert client.post(PATH, headers=h, content=deck()).status_code == 503
    assert state["calls"] == ["remote-attempt"]


@pytest.mark.parametrize("remote_started", [False, True])
def test_request_cancel_distinguishes_local_upload_and_remote_job(setup, monkeypatch, remote_started):
    client, h, state = setup
    original_read = ppt.read_presentation
    original_forward = ppt.forward
    async def run():
        entered = asyncio.Event()
        async def read(*args):
            if remote_started:
                return deck()
            entered.set()
            await asyncio.Future()
        async def forward(*args):
            state["calls"].append("remote-attempt")
            entered.set()
            await asyncio.Future()
        monkeypatch.setattr(ppt, "read_presentation", read)
        monkeypatch.setattr(ppt, "forward", forward)
        task = asyncio.create_task(ppt.convert(SimpleNamespace(headers={"x-bilge-pdf-consent": "1"})))
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert ppt._worker_uncertain is remote_started
    asyncio.run(run())
    monkeypatch.setattr(ppt, "read_presentation", original_read)
    monkeypatch.setattr(ppt, "forward", original_forward)
    assert client.post(PATH, headers=h, content=deck()).status_code == (503 if remote_started else 200)
    assert len(state["calls"]) == 1


@pytest.mark.parametrize("interruption", ["cancel", "timeout"])
def test_canceled_parser_keeps_single_slot_until_real_thread_finishes(setup, monkeypatch, interruption):
    client, h, state = setup
    original_read = ppt.read_presentation
    original_validate = ppt.validate_pptx
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    parse_calls = []
    def blocked_parser(data):
        parse_calls.append(1)
        entered.set()
        try:
            assert release.wait(3)
            return original_validate(data)
        finally:
            finished.set()
    async def read(*args):
        return deck()
    monkeypatch.setattr(ppt, "read_presentation", read)
    monkeypatch.setattr(ppt, "validate_pptx", blocked_parser)
    monkeypatch.setattr(ppt, "DEADLINE_SECONDS", .1 if interruption == "timeout" else 90)
    async def run():
        request = SimpleNamespace(headers={"x-bilge-pdf-consent": "1"})
        task = asyncio.create_task(ppt.convert(request))
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            if interruption == "cancel":
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            else:
                with pytest.raises(ppt.HTTPException) as timed_out:
                    await task
                assert timed_out.value.status_code == 504
            assert not ppt._worker_uncertain
            for _ in range(3):
                with pytest.raises(ppt.HTTPException) as busy:
                    await ppt.convert(request)
                assert busy.value.status_code == 429
            assert len(parse_calls) == 1 and not state["calls"]
        finally:
            release.set()
            assert await asyncio.to_thread(finished.wait, 2)
            # Allow the shielded task and its release callback to finish.
            for _ in range(100):
                if ppt._slot.acquire(blocking=False):
                    ppt._slot.release()
                    break
                await asyncio.sleep(.01)
            else:
                pytest.fail("parser lease was not released")
    asyncio.run(run())
    monkeypatch.setattr(ppt, "read_presentation", original_read)
    monkeypatch.setattr(ppt, "validate_pptx", original_validate)
    monkeypatch.setattr(ppt, "DEADLINE_SECONDS", 90)
    assert client.post(PATH, headers=h, content=deck()).status_code == 200
