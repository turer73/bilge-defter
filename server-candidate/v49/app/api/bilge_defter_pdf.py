"""Opt-in presentation adapter; no notebook access or stored conversion results.

Adapted from b03bb10 (private PDF adapter), with bounded PPTX validation. Legacy
converters use a fail-closed breaker: request timeout does not stop them. The
fixed UDS worker owns its lease until bounded conversion/process-group cleanup.
Legacy OLE .ppt is deliberately unsupported until a bounded parser is available.
"""
import asyncio
import io
import os
import re
import stat
import struct
import threading
import zipfile
import zlib
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.bilge_defter import account_guard

MAX_BYTES = 20 * 1024 * 1024
MAX_FILES = 2048
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_ENTRY_BYTES = 32 * 1024 * 1024
MAX_XML_BYTES = 2 * 1024 * 1024
MAX_XML_TOTAL_BYTES = 16 * 1024 * 1024
MAX_RATIO = 200
MAX_SLIDES = 50
DEADLINE_SECONDS = 90
UDS_WORKER_URL = "http://bilge-pptx-worker"
UDS_WORKER_SOCKET = "/run/bilge-pdf/worker.sock"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
MAIN_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
SLIDE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
NOTES_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"
SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
WORKBOOK_TYPE = SHEET_TYPE + ".main+xml"
WORKSHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
CHART_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
_slot = threading.BoundedSemaphore(1)  # Supported production configuration: one API worker.
_worker_uncertain = False
router = APIRouter(prefix="/api/v1/bilge-defter/pdf-tools",
                   dependencies=[Depends(account_guard)])


def configured_url():
    if any(os.environ.get(key) != "1" for key in (
            "BILGE_DEFTER_PDF_ENABLED", "BILGE_DEFTER_PDF_USAGE_VERIFIED",
            "BILGE_DEFTER_PDF_ISOLATION_VERIFIED")):
        raise HTTPException(503, "Sunum dönüştürme henüz açılmadı; sunumu PDF olarak dışa aktarın")
    url = os.environ.get("BILGE_DEFTER_PDF_URL", "")
    if url not in {"http://stirling-pdf:8080", "http://127.0.0.1:8090", UDS_WORKER_URL}:
        raise HTTPException(503, "Sunum hizmeti yapılandırması eksik")
    return url


@router.get("/status")
def status():
    url = None
    try:
        url = configured_url()
        configured = True
    except HTTPException:
        configured = False
    uncertain = _worker_uncertain and url != UDS_WORKER_URL
    available = configured and not uncertain
    return {"configured": configured, "available": available,
            "upstream_verified": False, "worker_state": "unknown" if uncertain else "unchecked",
            "operations": ["convert"] if available else [],
            "convert_input_types": [PPTX] if available else [],
            "max_input_bytes": MAX_BYTES, "max_slides": MAX_SLIDES, "consent_required": True}


async def read_presentation(request):
    media = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if media != PPTX:
        raise HTTPException(415, "Yalnız PPTX kabul edilir; eski PPT sunumunu önce PDF olarak dışa aktarın")
    if request.headers.get("content-encoding", "identity").lower() != "identity":
        raise HTTPException(415, "Sıkıştırılmış istek gövdesi kabul edilmez")
    length = request.headers.get("content-length")
    if length is not None:
        try:
            length = int(length)
        except ValueError:
            raise HTTPException(400, "Geçersiz dosya boyutu") from None
        if length < 0:
            raise HTTPException(400, "Geçersiz dosya boyutu")
        if length > MAX_BYTES:
            raise HTTPException(413, "Sunum en fazla 20 MB olabilir")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, "Sunum en fazla 20 MB olabilir")
        body.extend(chunk)
    return bytes(body)


def _reject_package():
    raise ValueError("Unsupported presentation")


def _part_name(name):
    # Keep one unambiguous URI/ZIP spelling. Percent escapes, fragments and query
    # strings are deliberately unsupported in this pilot (including benign ones).
    if (not name or any(ord(char) <= 32 or ord(char) == 127 for char in name)
            or any(char in name for char in "\\:%?#")
            or any(part in {"", ".", ".."} or part.endswith(".") for part in name.split("/"))):
        _reject_package()
    return name


def _internal_target(source, target):
    # OPC relationship targets resolve against the source PART, not its .rels
    # file. A single leading slash is package-absolute; // introduces authority.
    if (not target or target.startswith("//")
            or any(ord(char) <= 32 or ord(char) == 127 for char in target)
            or any(char in target for char in "\\:%?#")):
        _reject_package()
    components = [] if target.startswith("/") else source.split("/")[:-1]
    for part in target.lstrip("/").split("/"):
        if part == "..":
            if not components:
                _reject_package()
            components.pop()
        elif part != ".":
            if not part:
                _reject_package()
            components.append(part)
    return _part_name("/".join(components))


def _unsafe_ooxml_type(value):
    return any(token in value.lower() for token in (
        "macroenabled", "vbaproject", "vbadata", "activex", "oleobject",
        "macrosheet", "dialogsheet", "externallink", "connections", "querytable"))


def _read_ooxml(data, budget, workbook=False):
    """Read at most two package levels; every level shares allocation budgets."""
    if not data.startswith(b"PK\x03\x04"):
        _reject_package()
    # Inspect the fixed EOCD before ZipFile can allocate one object per entry.
    end = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
    if end < 0 or end + 22 > len(data):
        _reject_package()
    _, disk, directory_disk, disk_count, count, size, offset, comment = struct.unpack_from("<4s4H2LH", data, end)
    if (disk or directory_disk or count != disk_count or not 1 <= count <= MAX_FILES - budget["files"]
            or size > 1024 * 1024 or offset + size != end or end + 22 + comment != len(data)
            or data[max(0, end - 20):end].startswith(b"PK\x06\x07")):
        _reject_package()
    budget["files"] += count
    names = set()
    files = set()
    documents = {}
    embedded = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != count:
            _reject_package()
        for entry in entries:
            name = entry.orig_filename
            _part_name(name[:-1] if entry.is_dir() else name)
            lower = name.lower()
            is_embedded = (not workbook and name.startswith("ppt/embeddings/")
                           and len(name.split("/")) == 3 and name.endswith(".xlsx"))
            embedding_directory = not workbook and name == "ppt/embeddings/"
            if (name != entry.filename or lower.rstrip("/") in names or entry.flag_bits & 1
                    or stat.S_ISLNK(entry.external_attr >> 16)
                    or entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
                    or entry.file_size > MAX_ENTRY_BYTES
                    or entry.file_size > max(1, entry.compress_size) * MAX_RATIO
                    or lower.endswith((".svg", ".html", ".htm", ".js", ".vbs", ".exe"))
                    or any(part in lower for part in ("vbaproject", "vbadata", "activex/", "customui/"))
                    or ("embeddings/" in lower and not (is_embedded or embedding_directory))
                    or (workbook and any(part in lower for part in (
                        "externallinks/", "connections", "querytables/", "macrosheets/", "dialogsheets/")))):
                _reject_package()
            names.add(lower.rstrip("/"))
            if not entry.is_dir():
                files.add(name)
            budget["expanded"] += entry.file_size
            if budget["expanded"] > MAX_EXPANDED_BYTES:
                _reject_package()
            is_xml = lower.endswith((".xml", ".rels"))
            if is_xml:
                budget["xml"] += entry.file_size
                if entry.file_size > MAX_XML_BYTES or budget["xml"] > MAX_XML_TOTAL_BYTES:
                    _reject_package()
            # Stream every entry: claimed lengths, CRC and decompression must agree.
            actual = 0
            chunks = []
            with archive.open(entry) as stream:
                while chunk := stream.read(65536):
                    if actual == 0 and (chunk.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
                            or (chunk.startswith(b"PK\x03\x04") and not is_embedded)):
                        _reject_package()
                    actual += len(chunk)
                    if actual > entry.file_size or actual > MAX_ENTRY_BYTES:
                        _reject_package()
                    if is_xml or is_embedded:
                        chunks.append(chunk)
            if actual != entry.file_size or (entry.is_dir() and actual):
                _reject_package()
            if is_embedded:
                embedded[name] = b"".join(chunks)
            if is_xml:
                raw = b"".join(chunks)
                # Reject entities/DTDs even in UTF-16/32.
                normalized = raw.replace(b"\x00", b"").lower()
                if b"<!doctype" in normalized or b"<!entity" in normalized:
                    _reject_package()
                root = ElementTree.fromstring(raw)
                for node in root.iter():
                    local = node.tag.rsplit("}", 1)[-1].lower()
                    if _unsafe_ooxml_type(node.attrib.get("ContentType", "")):
                        _reject_package()
                    if local == "relationship" and not lower.endswith(".rels"):
                        _reject_package()
                    if workbook and local in {"externallink", "externalreferences", "externalreference",
                                              "ddelink", "olelink", "oleobjects", "oleobject",
                                              "connections", "connection", "querytable", "querytables"}:
                        _reject_package()
                documents[name] = root
    return files, documents, embedded


def _content_types(documents, files):
    root = documents.get("[Content_Types].xml")
    if root is None or root.tag != "{" + CONTENT_TYPES_NS + "}Types":
        _reject_package()
    defaults, overrides = {}, {}
    for node in root:
        content_type = node.attrib.get("ContentType", "")
        if not content_type or _unsafe_ooxml_type(content_type):
            _reject_package()
        if node.tag == "{" + CONTENT_TYPES_NS + "}Default":
            extension = node.attrib.get("Extension", "").lower()
            if not extension or extension in defaults:
                _reject_package()
            defaults[extension] = content_type
        elif node.tag == "{" + CONTENT_TYPES_NS + "}Override":
            name = node.attrib.get("PartName", "")
            if not name.startswith("/"):
                _reject_package()
            name = _part_name(name[1:])
            if name in overrides or name not in files:
                _reject_package()
            overrides[name] = content_type
        else:
            _reject_package()
    types = {name: overrides.get(name, defaults.get(name.rsplit(".", 1)[-1].lower(), "")) for name in files}
    # Renaming an XML part must not bypass DTD, relationship or active-content
    # inspection. Nonstandard XML extensions remain outside this pilot.
    if any((kind.lower().endswith("+xml") or kind.lower() in {"application/xml", "text/xml"})
           and name not in documents for name, kind in types.items()):
        _reject_package()
    return types


def _citation_url(target):
    """Literal HTTP(S) citation, never a destination fetched by this adapter.

    URI checks are not DNS/redirect protection: converter network isolation is
    still mandatory. Keep credentials, local names, other schemes and ambiguous
    spellings outside this small pilot.
    """
    if (not target or len(target) > 4096 or not target.isascii()
            or re.search(r"[\x00-\x20\x7f\\<>\"']|%(?![0-9a-fA-F]{2})", target)
            or re.search(r"[\x00-\x1f\x7f\\]", unquote(target))):
        _reject_package()
    try:
        parsed = urlsplit(target)
        host = parsed.hostname or ""
        if (parsed.scheme not in {"http", "https"} or parsed.username is not None
                or parsed.password is not None or '%' in parsed.netloc
                or parsed.port not in {None, 80 if parsed.scheme == "http" else 443}
                or len(host) > 253 or '.' not in host
                or not re.fullmatch(r"[a-z0-9.-]+", host)
                or not any('a' <= char <= 'z' for char in host)
                or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                       for label in host.split('.'))
                or host.endswith(('.localhost', '.local', '.internal'))):
            _reject_package()
    except ValueError:
        _reject_package()
    return target


def _citation_references(root):
    # Index once per source part, not once per relationship (bounded linear work).
    references = {}
    allowed_attributes = {"{" + REL_NS + "}id", "tooltip", "history", "highlightClick",
                          "endSnd", "tgtFrame", "action", "invalidUrl"}
    text_parents = {"{" + DRAWING_NS + "}" + name for name in ("rPr", "defRPr", "endParaRPr")}
    for parent in root.iter():
        if "{http://www.w3.org/XML/1998/namespace}base" in parent.attrib:
            _reject_package()
        for node in parent:
            plain_click = (node.tag == "{" + DRAWING_NS + "}hlinkClick"
                           and parent.tag in text_parents and not len(node)
                           and set(node.attrib) <= allowed_attributes
                           and not node.attrib.get("action") and not node.attrib.get("invalidUrl"))
            for attribute, rid in node.attrib.items():
                if attribute.startswith("{" + REL_NS + "}"):
                    references.setdefault(rid, []).append(
                        plain_click and attribute == "{" + REL_NS + "}id")
    # Root-level relationship attributes cannot describe an ordinary text click.
    for attribute, rid in root.attrib.items():
        if attribute.startswith("{" + REL_NS + "}"):
            references.setdefault(rid, []).append(False)
    return references


def _package_relationships(documents, files, citation_types=None):
    relationships = {}
    for name, root in documents.items():
        if not name.lower().endswith(".rels"):
            continue
        if not name.endswith(".rels"):
            _reject_package()
        if name == "_rels/.rels":
            source = ""
        elif "/_rels/" in name:
            directory, leaf = name.rsplit("/_rels/", 1)
            source = directory + "/" + leaf[:-5]
        elif name.startswith("_rels/"):
            source = name[6:-5]
        else:
            _reject_package()
        if ((source and source not in files) or source in relationships
                or root.tag != "{" + PACKAGE_REL_NS + "}Relationships"):
            _reject_package()
        edges = {}
        citation_references = None
        for node in root.iter():
            if "{http://www.w3.org/XML/1998/namespace}base" in node.attrib:
                _reject_package()
        for node in root:
            rid, kind = node.attrib.get("Id", ""), node.attrib.get("Type", "")
            if (node.tag != "{" + PACKAGE_REL_NS + "}Relationship" or len(node) or not rid or rid in edges
                    or not kind or _unsafe_ooxml_type(kind)):
                _reject_package()
            mode = node.attrib.get("TargetMode", "Internal")
            if mode == "External":
                source_root = documents.get(source)
                expected_root = {SLIDE_TYPE: "sld", NOTES_TYPE: "notes"}.get((citation_types or {}).get(source))
                if (kind != REL_NS + "/hyperlink" or not expected_root or source_root is None
                        or source_root.tag != "{" + PRESENTATION_NS + "}" + expected_root):
                    _reject_package()
                if citation_references is None:
                    citation_references = _citation_references(source_root)
                uses = citation_references.get(rid, [])
                if not uses or not all(uses):
                    _reject_package()
                edges[rid] = (kind, _citation_url(node.attrib.get("Target", "")))
                continue
            if mode != "Internal":
                _reject_package()
            target = _internal_target(source, node.attrib.get("Target", ""))
            if target not in files or target.lower().endswith(".rels"):
                _reject_package()
            edges[rid] = (kind, target)
        relationships[source] = edges
    return relationships


def _require_main(documents, types, relationships, name, content_type, namespace, local):
    root = documents.get(name)
    if (root is None or root.tag != "{" + namespace + "}" + local
            or types.get(name) != content_type
            or [edge for edge in relationships.get("", {}).values()
                if edge[0] == REL_NS + "/officeDocument"] != [(REL_NS + "/officeDocument", name)]):
        _reject_package()
    return root


def _validate_workbook(data, budget):
    files, documents, embedded = _read_ooxml(data, budget, workbook=True)
    types = _content_types(documents, files)
    relationships = _package_relationships(documents, files)
    root = _require_main(documents, types, relationships, "xl/workbook.xml", WORKBOOK_TYPE, SHEET_NS, "workbook")
    sheets = root.findall("{" + SHEET_NS + "}sheets/{" + SHEET_NS + "}sheet")
    if not sheets or embedded or any(kind == REL_NS + "/package" for edges in relationships.values()
                                    for kind, _ in edges.values()):
        _reject_package()
    for sheet in sheets:
        edge = relationships.get("xl/workbook.xml", {}).get(sheet.attrib.get("{" + REL_NS + "}id"))
        if (not edge or edge[0] != REL_NS + "/worksheet" or types.get(edge[1]) != WORKSHEET_TYPE
                or documents.get(edge[1]) is None
                or documents[edge[1]].tag != "{" + SHEET_NS + "}worksheet"):
            _reject_package()


def validate_pptx(data):
    """Bound PPTX and chart XLSX parsing before the network-isolated converter.

    Only chart-owned, macro-free XLSX packages may be embedded. Their directory,
    expanded bytes and XML count against the SAME limits as the outer PPTX.
    No deeper packages, OLE, macros or linked resources. Plain HTTP(S) text
    citations in slides/notes are retained, without fetching their targets.
    """
    if len(data) > MAX_BYTES:
        _reject_package()
    try:
        budget = {"files": 0, "expanded": 0, "xml": 0}
        files, documents, embedded = _read_ooxml(data, budget)
        types = _content_types(documents, files)
        relationships = _package_relationships(documents, files, citation_types=types)
        presentation = _require_main(documents, types, relationships, "ppt/presentation.xml",
                                     MAIN_TYPE, PRESENTATION_NS, "presentation")
        slide_lists = presentation.findall("{" + PRESENTATION_NS + "}sldIdLst")
        if len(slide_lists) != 1:
            _reject_package()
        slides = list(slide_lists[0])
        if not 1 <= len(slides) <= MAX_SLIDES or any(
                node.tag != "{" + PRESENTATION_NS + "}sldId" for node in slides):
            _reject_package()
        # Chart locations vary by producer. Trust the part's type, XML root and
        # inbound chart relationship, not a hard-coded ppt/charts directory.
        chart_targets = {target for edges in relationships.values() for kind, target in edges.values()
                         if kind == REL_NS + "/chart"}
        bound = set()
        for source, edges in relationships.items():
            package_ids = {rid for rid, (kind, _) in edges.items() if kind == REL_NS + "/package"}
            if not package_ids:
                continue
            chart = documents.get(source)
            if (source not in chart_targets or types.get(source) != CHART_TYPE
                    or chart is None or chart.tag != "{" + CHART_NS + "}chartSpace"):
                _reject_package()
            references = {node.attrib.get("{" + REL_NS + "}id")
                          for node in chart.iter("{" + CHART_NS + "}externalData")}
            if references != package_ids:
                _reject_package()
            for rid in package_ids:
                target = edges[rid][1]
                if target not in embedded or types.get(target) != SHEET_TYPE:
                    _reject_package()
                bound.add(target)
        if bound != set(embedded):
            _reject_package()
        for target in sorted(bound):
            _validate_workbook(embedded[target], budget)
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError, EOFError,
            ElementTree.ParseError, struct.error, zlib.error) as exc:
        raise ValueError("Unsupported presentation") from exc


async def forward(url, data, job):
    headers = {"Accept-Encoding": "identity"}
    options = {"timeout": httpx.Timeout(75, connect=5),
               "trust_env": False, "follow_redirects": False}
    if url == UDS_WORKER_URL:
        # The URL is a mode selector, never a DNS/network destination. Neither
        # request headers nor environment-provided secrets/socket paths cross it.
        options["transport"] = httpx.AsyncHTTPTransport(uds=UDS_WORKER_SOCKET, retries=0)
        headers["Content-Type"] = PPTX
        destination = url + "/convert"
        upload = {"content": data}
    else:
        secret = os.environ.get("BILGE_DEFTER_PDF_API_KEY", "")
        if secret:
            headers["X-API-KEY"] = secret
        destination = url + "/api/v1/convert/file/pdf"
        upload = {"files": {"fileInput": ("document.pptx", data, PPTX)}}
    async with httpx.AsyncClient(**options) as client:
        async with client.stream("POST", destination, headers=headers, **upload) as upstream:
            # Headers alone do not prove the remote job has finished. Consume a
            # bounded raw body to EOF, including error replies, without decoding
            # potentially compressed input or exposing worker error details.
            limit = MAX_BYTES if upstream.status_code == 200 else min(MAX_BYTES, 65536)
            received = 0
            result = bytearray()
            identity = upstream.headers.get("content-encoding", "identity").lower() == "identity"
            async for chunk in upstream.aiter_raw():
                received += len(chunk)
                if received > limit:
                    raise HTTPException(502, "Sunum hizmeti yanıtı dosya sınırını aşıyor")
                if upstream.status_code == 200 and identity:
                    result.extend(chunk)
            job["remote_completed"] = True
            if upstream.status_code == 429:
                raise HTTPException(429, "Sunum hizmeti meşgul; sonra deneyin", headers={"Retry-After": "60"})
            if upstream.status_code in {400, 413, 422}:
                raise HTTPException(422, "Sunum işlenemedi; özgün dosya korunuyor")
            if upstream.status_code != 200:
                raise HTTPException(503, "Sunum hizmetine erişilemiyor")
            if upstream.headers.get("content-type", "").split(";")[0].strip().lower() != "application/pdf":
                raise HTTPException(502, "Sunum hizmeti beklenen PDF dosyasını döndürmedi")
            if not identity:
                raise HTTPException(502, "Sunum hizmeti beklenmeyen sıkıştırılmış yanıt döndürdü")
    if not result.startswith(b"%PDF-") or b"%%EOF" not in result[-1024:]:
        raise HTTPException(502, "Sunum hizmetinden eksik PDF geldi")
    return bytes(result)


async def forward_while_connected(request, url, data, job):
    # Only called after read_presentation consumed the body: polling receive
    # earlier could steal an upload chunk. Minimal internal callers may lack a
    # receive channel; ASGI requests always provide is_disconnected.
    is_disconnected = getattr(request, "is_disconnected", None)
    if is_disconnected is None:
        job["remote_started"] = True
        return await forward(url, data, job)
    if await is_disconnected():
        raise HTTPException(499, "İstemci bağlantısı kesildi")

    stop_watching = asyncio.Event()

    async def watch_disconnect():
        while not stop_watching.is_set() and not await is_disconnected():
            await asyncio.sleep(.1)

    job["remote_started"] = True
    upstream = asyncio.create_task(forward(url, data, job))
    disconnected = asyncio.create_task(watch_disconnect())
    try:
        done, _ = await asyncio.wait((upstream, disconnected), return_when=asyncio.FIRST_COMPLETED)
        if upstream in done:
            return await upstream
        await disconnected
        raise HTTPException(499, "İstemci bağlantısı kesildi")
    finally:
        # Close the UDS request so the worker can kill its process group, and
        # finish HTTP cleanup before releasing the API's only conversion slot.
        # Cancellation is not proof of worker completion. The fixed UDS worker
        # owns a separate lease through process-group cleanup, so a retry gets
        # 429 while busy (503 if cleanup failed). Legacy converters instead need
        # the API breaker until a bounded response has been consumed through EOF.
        # Starlette's nonblocking receive probe uses its own cancellation scope;
        # it may consume cancellation arriving inside that probe. An explicit
        # stop signal also makes the watcher terminate in that race.
        stop_watching.set()
        for task in (upstream, disconnected):
            if not task.done():
                task.cancel()
        await asyncio.gather(upstream, disconnected, return_exceptions=True)


async def process(request, url, job):
    data = await read_presentation(request)
    try:
        # Shield the task, not the HTTP request. If the request goes away, its
        # lease remains held until the actual bounded parser thread has finished.
        job["validation"] = asyncio.create_task(asyncio.to_thread(validate_pptx, data))
        await asyncio.shield(job["validation"])
    except ValueError:
        raise HTTPException(415, "Sunum doğrulanamadı veya güvenli sınırları aşıyor; PDF olarak dışa aktarın") from None
    result = await forward_while_connected(request, url, data, job)
    return Response(result, media_type="application/pdf", headers={
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'attachment; filename="bilge-defter-sunum.pdf"',
        "X-Bilge-Pdf-Result": "converted"})


@router.post("/convert")
async def convert(request: Request):
    global _worker_uncertain
    url = configured_url()
    if request.headers.get("x-bilge-pdf-consent") != "1":
        raise HTTPException(400, "Seçilen sunumu Klipper'a göndermek için açık onay gerekli")
    if _worker_uncertain and url != UDS_WORKER_URL:
        raise HTTPException(503, "Önceki işlemin durumu belirsiz; yönetici hizmeti denetlemeli")
    if not _slot.acquire(blocking=False):
        raise HTTPException(429, "Başka bir sunum işleniyor; biraz sonra deneyin", headers={"Retry-After": "10"})
    job = {"remote_started": False, "remote_completed": False, "validation": None}
    try:
        return await asyncio.wait_for(process(request, url, job), timeout=DEADLINE_SECONDS)
    except (TimeoutError, httpx.TimeoutException):
        if job["remote_started"] and not job["remote_completed"]:
            if url == UDS_WORKER_URL:
                raise HTTPException(504, "Sunum işlemi zaman aşımına uğradı; yeniden deneyin") from None
            _worker_uncertain = True
            raise HTTPException(504, "İşlem zaman aşımına uğradı; uzak işlem durumu belirsiz, yönetici denetimi gerekli") from None
        if job["remote_completed"]:
            raise HTTPException(504, "Sunum yanıtının işlenmesi zaman aşımına uğradı; yeniden deneyin") from None
        raise HTTPException(504, "Sunum alımı veya doğrulaması zaman aşımına uğradı; dönüştürücüye gönderilmedi") from None
    except httpx.HTTPError:
        if job["remote_started"] and not job["remote_completed"]:
            if url == UDS_WORKER_URL:
                raise HTTPException(503, "Sunum hizmetine erişilemiyor; yeniden deneyin") from None
            _worker_uncertain = True
            raise HTTPException(503, "Bağlantı kesildi; uzak işlem durumu belirsiz, yönetici denetimi gerekli") from None
        if job["remote_completed"]:
            raise HTTPException(503, "Sunum hizmetinin yanıtı işlenemedi; yeniden deneyin") from None
        raise HTTPException(503, "Sunum gönderilemedi; dönüştürücüye ulaşılmadı") from None
    except asyncio.CancelledError:
        if url != UDS_WORKER_URL and job["remote_started"] and not job["remote_completed"]:
            _worker_uncertain = True
        raise
    except HTTPException:
        if url != UDS_WORKER_URL and job["remote_started"] and not job["remote_completed"]:
            _worker_uncertain = True
        raise
    finally:
        validation = job["validation"]
        if validation is not None and not validation.done():
            def release_after_validation(task):
                try:
                    task.exception()  # Retrieve any abandoned parser exception.
                except asyncio.CancelledError:
                    pass
                finally:
                    _slot.release()
            validation.add_done_callback(release_after_validation)
        else:
            if validation is not None:
                try:
                    validation.exception()
                except asyncio.CancelledError:
                    pass
            _slot.release()
