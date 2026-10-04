"""Fixed UDS routing and cancellation contracts; no live worker or user data."""
import asyncio
import threading

import httpx
import pytest

from app.api import bilge_defter_pdf as ppt
from test_accounts_cas import env, approved
from test_presentations import PATH, STATUS, PDF, deck


@pytest.fixture
def uds(env, monkeypatch):
    env[0].app.include_router(ppt.router)
    for key in ("BILGE_DEFTER_PDF_ENABLED", "BILGE_DEFTER_PDF_USAGE_VERIFIED",
                "BILGE_DEFTER_PDF_ISOLATION_VERIFIED"):
        monkeypatch.setenv(key, "1")
    monkeypatch.setenv("BILGE_DEFTER_PDF_URL", "http://bilge-pptx-worker")
    monkeypatch.setenv("BILGE_DEFTER_PDF_API_KEY", "private-worker-key")
    monkeypatch.setenv("BILGE_DEFTER_PDF_SOCKET", "/untrusted/override.sock")
    monkeypatch.setenv("HTTP_PROXY", "http://untrusted-proxy.invalid:8000")
    monkeypatch.setenv("HTTPS_PROXY", "http://untrusted-proxy.invalid:8000")
    monkeypatch.setattr(ppt, "_worker_uncertain", False)
    monkeypatch.setattr(ppt, "_slot", threading.BoundedSemaphore(1))
    state = {"calls": [], "transports": [], "clients": [], "status": 200,
             "body": PDF, "stream": None, "error": None}

    def handle(request):
        state["calls"].append(request)
        if state["error"] is not None:
            raise state["error"]
        stream = state["stream"] if state["stream"] is not None else httpx.ByteStream(state["body"])
        return httpx.Response(state["status"], stream=stream,
                              headers={"Content-Type": "application/pdf"})

    def transport(**kwargs):
        state["transports"].append(kwargs)
        return httpx.MockTransport(handle)

    real_client = httpx.AsyncClient

    def client(**kwargs):
        state["clients"].append(kwargs)
        return real_client(**kwargs)

    monkeypatch.setattr(ppt.httpx, "AsyncHTTPTransport", transport)
    monkeypatch.setattr(ppt.httpx, "AsyncClient", client)
    headers = {**approved(env), "Content-Type": ppt.PPTX, "X-Bilge-Pdf-Consent": "1"}
    return env[0], headers, state


def test_fixed_uds_raw_bytes_without_identity_secrets_or_proxy(uds):
    client, headers, state = uds
    body = deck()
    response = client.post(PATH, content=body, headers={
        **headers, "Cookie": "private-cookie", "Authorization": "Bearer private-token",
        "X-API-KEY": "request-key", "X-Filename": "student-name.pptx",
        "CF-Access-Client-Id": "private-id", "CF-Access-Client-Secret": "private-secret"})
    assert response.status_code == 200 and response.content == PDF
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.headers["X-Bilge-Pdf-Result"] == "converted"
    assert state["transports"] == [{"uds": "/run/bilge-pdf/worker.sock", "retries": 0}]
    assert len(state["clients"]) == 1
    assert state["clients"][0]["trust_env"] is False
    assert state["clients"][0]["follow_redirects"] is False
    call, = state["calls"]
    assert call.method == "POST" and str(call.url) == "http://bilge-pptx-worker/convert"
    assert call.content == body
    assert call.headers["Content-Type"] == ppt.PPTX
    assert call.headers["Accept-Encoding"] == "identity"
    assert int(call.headers["Content-Length"]) == len(body)
    for name in ("Cookie", "Authorization", "X-API-KEY", "X-Filename", "Origin",
                 "Cf-Access-Jwt-Assertion", "X-Bilge-Account", "X-Bilge-Request",
                 "X-Bilge-Pdf-Consent", "CF-Access-Client-Id", "CF-Access-Client-Secret"):
        assert name not in call.headers
    assert client.get(STATUS, headers=headers).json()["operations"] == ["convert"]


@pytest.mark.parametrize("url", [
    "http://bilge-pptx-worker/", "http://bilge-pptx-worker:80", "https://bilge-pptx-worker",
    "http://user@bilge-pptx-worker", "http://bilge-pptx-worker/convert",
    "http://bilge-pptx-worker?uds=/other.sock", "http://bilge-pptx-worker#socket",
    "unix:///run/bilge-pdf/worker.sock", "http://BILGE-PPTX-WORKER",
])
def test_uds_selector_rejects_ambiguous_configuration(uds, monkeypatch, url):
    client, headers, state = uds
    monkeypatch.setenv("BILGE_DEFTER_PDF_URL", url)
    assert client.get(STATUS, headers=headers).json()["configured"] is False
    assert client.post(PATH, headers=headers, content=deck()).status_code == 503
    assert not state["calls"] and not state["transports"]


@pytest.mark.parametrize("key", ["BILGE_DEFTER_PDF_ENABLED", "BILGE_DEFTER_PDF_USAGE_VERIFIED",
                                "BILGE_DEFTER_PDF_ISOLATION_VERIFIED"])
def test_uds_still_requires_each_configuration_gate(uds, monkeypatch, key):
    client, headers, state = uds
    monkeypatch.delenv(key)
    assert client.post(PATH, headers=headers, content=deck()).status_code == 503
    assert not state["calls"] and not state["transports"]


def request_with_disconnect(disconnected):
    """Real Request receive channel, with disconnect only after the last chunk."""
    body = deck()
    chunks = [{"type": "http.request", "body": body[:20], "more_body": True},
              {"type": "http.request", "body": body[20:], "more_body": False}]

    async def receive():
        if chunks:
            return chunks.pop(0)
        if disconnected.is_set():
            return {"type": "http.disconnect"}
        await asyncio.Future()

    request = ppt.Request({"type": "http", "method": "POST", "path": PATH,
                           "headers": [(b"content-type", ppt.PPTX.encode()),
                                       (b"x-bilge-pdf-consent", b"1")]}, receive)
    original_check = request.is_disconnected

    async def check_after_body():
        assert not chunks, "disconnect poll consumed an unread request body"
        return await original_check()

    request.is_disconnected = check_after_body
    return request


@pytest.mark.parametrize("interruption", ["disconnect", "cancel", "deadline"])
def test_cancellation_closes_upstream_before_slot_release_then_worker_gates_retry(uds, monkeypatch, interruption):
    _, _, state = uds
    if interruption == "deadline":
        monkeypatch.setattr(ppt, "DEADLINE_SECONDS", .15)

    async def run():
        entered, canceled, closing, release, closed = [asyncio.Event() for _ in range(5)]
        disconnected = asyncio.Event()

        class WaitingBody(httpx.AsyncByteStream):
            async def __aiter__(self):
                entered.set()
                try:
                    await asyncio.Future()
                except asyncio.CancelledError:
                    canceled.set()
                    raise
                yield b"unreachable"

            async def aclose(self):
                closing.set()
                await release.wait()
                closed.set()

        state["stream"] = WaitingBody()
        task = asyncio.create_task(ppt.convert(request_with_disconnect(disconnected)))
        try:
            await asyncio.wait_for(entered.wait(), 2)
            if interruption == "disconnect":
                disconnected.set()
            elif interruption == "cancel":
                task.cancel()
            await asyncio.wait_for(closing.wait(), 2)
            assert canceled.is_set() and not closed.is_set() and not task.done()
            for _ in range(2):
                with pytest.raises(ppt.HTTPException) as busy:
                    await ppt.convert(request_with_disconnect(asyncio.Event()))
                assert busy.value.status_code == 429
            assert len(state["calls"]) == 1
        finally:
            release.set()
            if interruption == "cancel":
                with pytest.raises(asyncio.CancelledError):
                    await task
            else:
                with pytest.raises(ppt.HTTPException) as stopped:
                    await task
                assert stopped.value.status_code == (499 if interruption == "disconnect" else 504)
        assert closed.is_set() and not ppt._worker_uncertain
        assert ppt._slot.acquire(blocking=False)
        ppt._slot.release()
        # The worker can still be cleaning its process group after socket close.
        # Its own busy response must reach the next caller, without a permanent
        # API breaker. Real worker lease/process tests cover the other side.
        state.update(stream=None, status=429, body=b"worker cleaning")
        with pytest.raises(ppt.HTTPException) as busy:
            await ppt.convert(request_with_disconnect(asyncio.Event()))
        assert busy.value.status_code == 429 and len(state["calls"]) == 2
        state.update(status=200, body=PDF)
        response = await ppt.convert(request_with_disconnect(asyncio.Event()))
        assert response.status_code == 200 and response.body == PDF
        assert len(state["calls"]) == 3 and not ppt._worker_uncertain

    asyncio.run(run())


def test_disconnect_before_forward_does_not_open_breaker_or_start_worker(uds):
    client, headers, state = uds

    async def run():
        disconnected = asyncio.Event()
        disconnected.set()
        with pytest.raises(ppt.HTTPException) as stopped:
            await ppt.convert(request_with_disconnect(disconnected))
        assert stopped.value.status_code == 499

    asyncio.run(run())
    assert not state["calls"] and not ppt._worker_uncertain
    assert client.post(PATH, headers=headers, content=deck()).status_code == 200
    assert len(state["calls"]) == 1


@pytest.mark.parametrize("status,expected", [(200, 200), (400, 422), (413, 422), (422, 422),
                                            (429, 429), (500, 503)])
def test_bounded_eof_releases_uds_slot_for_next_conversion(uds, status, expected):
    client, headers, state = uds
    state.update(status=status, body=PDF if status == 200 else b"private worker failure")
    first = client.post(PATH, headers=headers, content=deck())
    assert first.status_code == expected and b"private worker failure" not in first.content
    assert not ppt._worker_uncertain
    state.update(status=200, body=PDF)
    second = client.post(PATH, headers=headers, content=deck())
    assert second.status_code == 200 and second.content == PDF
    assert len(state["calls"]) == 2


@pytest.mark.parametrize("error,expected", [(httpx.ReadTimeout("private"), 504),
                                           (httpx.ReadError("private"), 503)])
def test_interrupted_uds_body_does_not_permanently_disable_worker(uds, error, expected):
    client, headers, state = uds

    class InterruptedBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"%PDF-private"
            raise error

    state["stream"] = InterruptedBody()
    response = client.post(PATH, headers=headers, content=deck())
    assert response.status_code == expected and b"private" not in response.content
    assert not ppt._worker_uncertain
    state.update(stream=None, body=PDF)
    assert client.post(PATH, headers=headers, content=deck()).status_code == 200
    assert len(state["calls"]) == 2


def test_finished_forward_stops_probe_even_when_probe_swallows_cancellation(uds, monkeypatch):
    async def run():
        probing = asyncio.Event()
        request = request_with_disconnect(asyncio.Event())
        checks = []

        async def is_disconnected():
            checks.append(1)
            if len(checks) == 1:
                return False
            probing.set()
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                # Starlette's nonblocking receive uses a cancellation scope.
                return False

        async def forward(url, data, job):
            await probing.wait()
            job["remote_completed"] = True
            return PDF

        request.is_disconnected = is_disconnected
        monkeypatch.setattr(ppt, "forward", forward)
        response = await asyncio.wait_for(ppt.convert(request), 2)
        assert response.status_code == 200 and response.body == PDF
        assert len(checks) == 2 and not ppt._worker_uncertain

    asyncio.run(run())


def test_uds_mode_does_not_inherit_or_clear_legacy_breaker(uds, monkeypatch):
    client, headers, state = uds
    monkeypatch.setattr(ppt, "_worker_uncertain", True)
    status = client.get(STATUS, headers=headers).json()
    assert status["available"] is True and status["worker_state"] == "unchecked"
    assert client.post(PATH, headers=headers, content=deck()).status_code == 200
    assert ppt._worker_uncertain
    monkeypatch.setenv("BILGE_DEFTER_PDF_URL", "http://stirling-pdf:8080")
    assert client.get(STATUS, headers=headers).json()["available"] is False
    assert client.post(PATH, headers=headers, content=deck()).status_code == 503
    assert len(state["calls"]) == 1
