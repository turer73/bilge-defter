"""Hand-authored OOXML package regression fixtures; no live converter or office SDK."""
import io
import struct
import zipfile
from xml.sax.saxutils import quoteattr

import pytest

from app.api import bilge_defter_pdf as ppt
from test_accounts_cas import env
from test_presentations import PATH, PDF, deck, setup

REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
TYPE_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
WORKBOOK_TYPE = SHEET_TYPE + ".main+xml"
WORKSHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
CHART_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
WORKBOOK_NAME = "ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx"


def archive(parts, compression=zipfile.ZIP_STORED):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=compression) as package:
        for name, body in parts.items():
            package.writestr(name, body)
    return output.getvalue()


def relationships(*items):
    return '<Relationships xmlns="' + PACKAGE_NS + '">' + ''.join(
        '<Relationship Id="' + rid + '" Type="' + REL_NS + '/' + kind +
        '" Target=' + quoteattr(target) + (' TargetMode="External"' if external else '') + '/>'
        for rid, kind, target, external in items) + '</Relationships>'


def workbook_parts():
    # Includes the ordinary Excel parts omitted by minimal XML-only ZIP fixtures.
    return {
        "[Content_Types].xml": '<Types xmlns="' + TYPE_NS + '">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="' + WORKBOOK_TYPE + '"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + WORKSHEET_TYPE + '"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
            '</Types>',
        "_rels/.rels": relationships(("rId1", "officeDocument", "xl/workbook.xml", False)),
        "xl/workbook.xml": '<workbook xmlns="' + SHEET_NS + '" xmlns:r="' + REL_NS + '">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": relationships(
            ("rId1", "worksheet", "worksheets/sheet1.xml", False),
            ("rId2", "sharedStrings", "sharedStrings.xml", False),
            ("rId3", "styles", "styles.xml", False),
            ("rId4", "theme", "theme/theme1.xml", False)),
        "xl/worksheets/sheet1.xml": '<worksheet xmlns="' + SHEET_NS + '"><sheetData>'
            '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>7</v></c></row>'
            '</sheetData></worksheet>',
        "xl/sharedStrings.xml": '<sst xmlns="' + SHEET_NS + '" count="1" uniqueCount="1"><si><t>Series</t></si></sst>',
        "xl/styles.xml": '<styleSheet xmlns="' + SHEET_NS + '"><fonts count="1"><font><sz val="11"/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
            '<cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>',
        "xl/theme/theme1.xml": '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"/>',
    }


def chart_parts(workbook=None, workbook_name=WORKBOOK_NAME, slides=1):
    with zipfile.ZipFile(io.BytesIO(deck(slides=slides))) as package:
        parts = {name: package.read(name) for name in package.namelist()}
    parts["[Content_Types].xml"] = parts["[Content_Types].xml"].decode().replace('</Types>',
        '<Default Extension="xlsx" ContentType="' + SHEET_TYPE + '"/>'
        '<Override PartName="/ppt/charts/chart1.xml" ContentType="' + CHART_TYPE + '"/></Types>')
    parts["ppt/slides/slide1.xml"] = '<p:sld xmlns:p="' + ppt.PRESENTATION_NS + '" xmlns:r="' + REL_NS + '">'
    parts["ppt/slides/slide1.xml"] += '<p:cSld><p:spTree><p:graphicFrame><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    parts["ppt/slides/slide1.xml"] += '<a:graphicData uri="' + CHART_NS + '"><c:chart xmlns:c="' + CHART_NS + '" r:id="rId1"/>'
    parts["ppt/slides/slide1.xml"] += '</a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>'
    parts["ppt/slides/_rels/slide1.xml.rels"] = relationships(("rId1", "chart", "../charts/chart1.xml", False))
    parts["ppt/charts/chart1.xml"] = '<c:chartSpace xmlns:c="' + CHART_NS + '" xmlns:r="' + REL_NS + '">'
    parts["ppt/charts/chart1.xml"] += '<c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>'
    parts["ppt/charts/chart1.xml"] += '<c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>Sheet1!$B$1</c:f>'
    parts["ppt/charts/chart1.xml"] += '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>7</c:v></c:pt></c:numCache>'
    parts["ppt/charts/chart1.xml"] += '</c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>'
    parts["ppt/charts/_rels/chart1.xml.rels"] = relationships(("rId1", "package", "../embeddings/" + workbook_name.rsplit('/', 1)[1].replace(' ', '%20'), False))
    parts[workbook_name] = archive(workbook_parts()) if workbook is None else workbook
    return parts


@pytest.mark.parametrize("absolute", [False, True])
def test_native_chart_workbook_is_accepted_and_forwarded(setup, absolute):
    client, headers, state = setup
    parts = chart_parts()
    if absolute:
        parts["_rels/.rels"] = relationships(("rId1", "officeDocument", "/ppt/presentation.xml", False))
        parts["ppt/charts/_rels/chart1.xml.rels"] = relationships(("rId1", "package", "/" + WORKBOOK_NAME, False))
        nested = workbook_parts()
        nested["_rels/.rels"] = relationships(("rId1", "officeDocument", "/xl/workbook.xml", False))
        parts[WORKBOOK_NAME] = archive(nested)
    response = client.post(PATH, headers=headers, content=archive(parts))
    assert response.status_code == 200 and response.content == PDF
    assert len(state["calls"]) == 1


@pytest.mark.parametrize("slides,expected", [(100, 200), (101, 422)])
def test_slide_limit_applies_after_valid_chart_workbook_checks(setup, slides, expected):
    client, headers, state = setup
    response = client.post(PATH, headers=headers, content=archive(chart_parts(slides=slides)))
    assert response.status_code == expected
    assert bool(state["calls"]) is (expected == 200)
    if expected == 422:
        assert response.json() == {"detail": {"code": "presentation_slide_limit",
                                             "max_slides": 100, "actual_slides": 101}}


def test_unsafe_embedded_workbook_does_not_get_slide_limit_error(setup):
    client, headers, state = setup
    nested = workbook_parts()
    nested["xl/vbaProject.bin"] = b"private macro data"
    response = client.post(PATH, headers=headers,
                           content=archive(chart_parts(archive(nested), slides=101)))
    assert response.status_code == 415
    assert isinstance(response.json()["detail"], str)
    assert not state["calls"]


def test_percent_encoded_names_are_a_conservative_pilot_limit():
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(chart_parts(workbook_name="ppt/embeddings/Chart%20Data.xlsx")))


def citation_parts(target="https://example.org/source", notes=False):
    """A visible citation run with an ordinary DrawingML text hyperlink."""
    with zipfile.ZipFile(io.BytesIO(deck())) as package:
        parts = {name: package.read(name) for name in package.namelist()}
    source = "ppt/notesSlides/notesSlide1.xml" if notes else "ppt/slides/slide1.xml"
    rel_name = source.rsplit('/', 1)[0] + '/_rels/' + source.rsplit('/', 1)[1] + '.rels'
    root = 'notes' if notes else 'sld'
    kind = ppt.NOTES_TYPE if notes else ppt.SLIDE_TYPE
    parts['[Content_Types].xml'] = parts['[Content_Types].xml'].decode().replace('</Types>',
        '<Override PartName="/' + source + '" ContentType="' + kind + '"/></Types>')
    parts[source] = ('<p:' + root + ' xmlns:p="' + ppt.PRESENTATION_NS + '" xmlns:a="' + ppt.DRAWING_NS
        + '" xmlns:r="' + REL_NS + '"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>'
        '<a:p><a:r><a:rPr><a:hlinkClick r:id="citation" tooltip="Source and license"/></a:rPr>'
        '<a:t>Source: Example. CC BY 4.0.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:' + root + '>')
    parts[rel_name] = relationships(('citation', 'hyperlink', target, True))
    if notes:
        parts['ppt/slides/_rels/slide1.xml.rels'] = relationships(('notes', 'notesSlide', '../notesSlides/notesSlide1.xml', False))
    return parts, source, rel_name


@pytest.mark.parametrize('notes', [False, True])
@pytest.mark.parametrize('target', ['https://example.org/source', 'http://example.org/chapter?q=skin#section',
                                   'https://example.org/My%20Source?q=%C3%B6', 'https://example.org:443/a'])
def test_plain_web_citations_are_preserved_and_forwarded(setup, notes, target):
    client, headers, state = setup
    parts, source, _ = citation_parts(target, notes)
    raw = archive(parts)
    response = client.post(PATH, headers=headers, content=raw)
    assert response.status_code == 200
    assert raw in state['calls'][0].content  # Original bytes, including attribution, unchanged.
    assert 'Source: Example. CC BY 4.0.' in parts[source]


@pytest.mark.parametrize('target', [
    'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'ftp://example.org/a',
    'mailto:person@example.org', '//example.org/a', 'https://user:pass@example.org/a',
    'https://example.org:8443/a', 'https://localhost/a', 'https://foo.local/a',
    'https://127.0.0.1/a', 'https://[::1]/a', 'https://169.254.169.254/a',
    'https://exa%6dple.org/a', 'https://example.org\\other/a', 'https://example.org/%5cpath',
    'https://example.org/%0aheader', 'https://example.org/%00', 'https://example.org/%ZZ',
    'https://example.org/raw space', 'https://example..org/', 'https://-example.org/',
    'https://example.org:bad/', 'https://example.org/' + 'a' * 4096,
])
def test_non_web_or_ambiguous_citation_targets_are_rejected_before_upload(setup, target):
    client, headers, state = setup
    parts, _, _ = citation_parts(target)
    assert client.post(PATH, headers=headers, content=archive(parts)).status_code == 415
    assert not state['calls']


@pytest.mark.parametrize('mutation', ['external_image', 'unreferenced', 'reused_by_image',
    'action', 'hover', 'child_sound', 'unknown_attribute', 'root_reference', 'other_owner',
    'wrong_mime', 'wrong_root', 'wrong_parent', 'xml_base', 'wrong_id_attribute', 'invalid_url'])
def test_web_link_exception_is_only_an_ordinary_text_citation(setup, mutation):
    client, headers, state = setup
    parts, source, rel_name = citation_parts()
    if mutation == 'external_image':
        parts[rel_name] = relationships(('citation', 'image', 'https://example.org/image.png', True))
    elif mutation == 'unreferenced':
        parts[source] = parts[source].replace('r:id="citation"', 'r:id="missing"')
    elif mutation == 'reused_by_image':
        parts[source] = parts[source].replace('</p:cSld>', '<a:blip r:link="citation"/></p:cSld>')
    elif mutation == 'action':
        parts[source] = parts[source].replace(' tooltip=', ' action="ppaction://program" tooltip=')
    elif mutation == 'hover':
        parts[source] = parts[source].replace('hlinkClick', 'hlinkMouseOver')
    elif mutation == 'child_sound':
        parts[source] = parts[source].replace('license"/>', 'license"><a:snd/></a:hlinkClick>')
    elif mutation == 'unknown_attribute':
        parts[source] = parts[source].replace(' tooltip=', ' extra="unexpected" tooltip=')
    elif mutation == 'root_reference':
        parts[source] = parts[source].replace('<p:sld ', '<p:sld r:id="citation" ')
    elif mutation == 'other_owner':
        parts['ppt/presentation.xml'] = parts['ppt/presentation.xml'].decode().replace('</p:presentation>',
            '<a:rPr xmlns:a="' + ppt.DRAWING_NS + '"><a:hlinkClick r:id="citation"/></a:rPr></p:presentation>')
        parts['ppt/_rels/presentation.xml.rels'] = relationships(('citation', 'hyperlink', 'https://example.org/', True))
    elif mutation == 'wrong_mime':
        parts['[Content_Types].xml'] = parts['[Content_Types].xml'].replace(ppt.SLIDE_TYPE, 'application/xml')
    elif mutation == 'wrong_root':
        parts[source] = parts[source].replace('p:sld', 'p:notes')
    elif mutation == 'wrong_parent':
        parts[source] = parts[source].replace('a:rPr', 'p:cNvPr')
    elif mutation == 'xml_base':
        parts[source] = parts[source].replace('<a:rPr>', '<a:rPr xml:base="https://other.example/">')
    elif mutation == 'wrong_id_attribute':
        parts[source] = parts[source].replace('r:id="citation"', 'r:embed="citation"')
    elif mutation == 'invalid_url':
        parts[source] = parts[source].replace(' tooltip=', ' invalidUrl="file:///etc/passwd" tooltip=')
    assert client.post(PATH, headers=headers, content=archive(parts)).status_code == 415
    assert not state['calls']


def test_chart_owned_workbook_does_not_require_a_fixed_chart_directory():
    parts = chart_parts()
    parts["ppt/slides/charts/chart1.xml"] = parts.pop("ppt/charts/chart1.xml")
    parts["ppt/slides/charts/_rels/chart1.xml.rels"] = parts.pop("ppt/charts/_rels/chart1.xml.rels").replace('../embeddings/', '../../embeddings/')
    parts["ppt/slides/_rels/slide1.xml.rels"] = relationships(("rId1", "chart", "charts/chart1.xml", False))
    parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace('/ppt/charts/chart1.xml', '/ppt/slides/charts/chart1.xml')
    ppt.validate_pptx(archive(parts))


@pytest.mark.parametrize("mutation", ["macro", "activex", "external", "dde", "connections", "query", "xl4", "nested", "wrong_type", "wrong_root", "docx", "ole", "bomb", "crc"])
def test_unsafe_embedded_workbooks_are_rejected(mutation):
    parts = workbook_parts()
    compression = zipfile.ZIP_STORED
    if mutation == "macro":
        parts["xl/vbaProject.bin"] = b"macro"
    elif mutation == "activex":
        parts["xl/activeX/activeX1.xml"] = '<x/>'
    elif mutation == "external":
        parts["xl/worksheets/_rels/sheet1.xml.rels"] = relationships(("rId1", "hyperlink", "https://example.com/", True))
    elif mutation == "dde":
        parts["xl/externalLinks/externalLink1.xml"] = '<externalLink xmlns="' + SHEET_NS + '"><ddeLink ddeService="cmd" ddeTopic="evil"/></externalLink>'
    elif mutation == "connections":
        parts["xl/connections.xml"] = '<connections xmlns="' + SHEET_NS + '"/>'
    elif mutation == "query":
        parts["xl/queryTables/queryTable1.xml"] = '<queryTable xmlns="' + SHEET_NS + '"/>'
    elif mutation == "xl4":
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace(WORKSHEET_TYPE, 'application/vnd.ms-excel.macrosheet+xml')
    elif mutation == "nested":
        parts["xl/embeddings/second.xlsx"] = archive(workbook_parts())
    elif mutation == "wrong_type":
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace(WORKBOOK_TYPE, 'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    elif mutation == "wrong_root":
        parts["xl/workbook.xml"] = '<workbook xmlns="urn:wrong"/>'
    elif mutation == "docx":
        parts = {"[Content_Types].xml": '<Types xmlns="' + TYPE_NS + '"/>', "word/document.xml": '<document/>'}
    elif mutation == "bomb":
        parts["xl/media/bomb.dat"] = b'x' * 100000
        compression = zipfile.ZIP_DEFLATED
    nested = archive(parts, compression)
    if mutation == "ole":
        nested = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1' + b'x' * 64
    elif mutation == "crc":
        nested = nested.replace(b'<workbook xmlns=', b'<Workbook xmlns=', 1)
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(chart_parts(nested)))


@pytest.mark.parametrize("mutation", ["orphan", "wrong_owner", "wrong_relation", "wrong_reference", "wrong_type", "docx", "ole"])
def test_only_chart_bound_xlsx_embeddings_are_supported(mutation):
    parts = chart_parts()
    if mutation == "orphan":
        parts["ppt/embeddings/orphan.xlsx"] = archive(workbook_parts())
    elif mutation == "wrong_owner":
        parts["ppt/slides/_rels/slide1.xml.rels"] = relationships(("rId1", "package", "../embeddings/Microsoft_Excel_Worksheet1.xlsx", False))
    elif mutation == "wrong_relation":
        parts["ppt/charts/_rels/chart1.xml.rels"] = relationships(("rId1", "oleObject", "../embeddings/Microsoft_Excel_Worksheet1.xlsx", False))
    elif mutation == "wrong_reference":
        parts["ppt/charts/chart1.xml"] = parts["ppt/charts/chart1.xml"].replace('externalData r:id="rId1"', 'externalData r:id="rId99"')
    elif mutation == "wrong_type":
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace(SHEET_TYPE + '"', 'application/octet-stream"')
    else:
        parts["ppt/embeddings/other." + ("docx" if mutation == "docx" else "bin")] = b'unsupported'
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(parts))


@pytest.mark.parametrize("target", [
    "https://example.com/a.xlsx", "//host/a.xlsx", "file:/ppt/embeddings/a.xlsx",
    "\\\\host\\a.xlsx", "/../ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx",
    "../../../outside.xlsx", "../embeddings/missing.xlsx", "../embeddings/Microsoft_Excel_Worksheet1.xlsx?query=1",
    "http%3a//host/a.xlsx", "%2f%2fhost/a.xlsx", "..%2fembeddings/Microsoft_Excel_Worksheet1.xlsx",
    "%2e%2e/embeddings/Microsoft_Excel_Worksheet1.xlsx", "../embeddings/%252e%252e/a.xlsx",
    "../embeddings/a%5cb.xlsx", "../embeddings/a%00.xlsx", "../embeddings/%zz.xlsx",
    "///host/a.xlsx", "../embeddings/Microsoft_Excel_Worksheet1.xlsx#fragment", "../embeddings/a%3Ab.xlsx",
])
@pytest.mark.parametrize("nested", [False, True])
def test_relationship_target_normalization_rejects_unsafe_or_missing_parts(target, nested):
    if nested:
        workbook = workbook_parts()
        workbook["xl/_rels/workbook.xml.rels"] = relationships(("rId1", "worksheet", target, False))
        parts = chart_parts(archive(workbook))
    else:
        parts = chart_parts()
        parts["ppt/charts/_rels/chart1.xml.rels"] = relationships(("rId1", "package", target, False))
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(parts))


@pytest.mark.parametrize("limit", ["MAX_FILES", "MAX_EXPANDED_BYTES", "MAX_XML_TOTAL_BYTES"])
def test_nested_workbook_uses_shared_package_budget(monkeypatch, limit):
    parts = chart_parts()
    nested = workbook_parts()
    if limit == "MAX_FILES":
        outer_usage, inner_usage = len(parts), len(nested)
    else:
        xml_only = limit == "MAX_XML_TOTAL_BYTES"
        def usage(items):
            return sum(len(value.encode() if isinstance(value, str) else value)
                       for name, value in items.items() if not xml_only or name.endswith(('.xml', '.rels')))
        outer_usage, inner_usage = usage(parts), usage(nested)
    # Each package alone fits; only counting outer + nested together rejects it.
    monkeypatch.setattr(ppt, limit, max(outer_usage, inner_usage))
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(parts))


@pytest.mark.parametrize("nested", [False, True])
@pytest.mark.parametrize("mutation", ["uppercase_rels", "uppercase_rels_directory", "duplicate_id", "xml_base", "unknown_mode", "hidden_xml", "nested_relationship"])
def test_relationship_metadata_cannot_skip_security_inspection(mutation, nested):
    parts = workbook_parts() if nested else chart_parts()
    source = "xl/workbook.xml" if nested else "ppt/slides/slide1.xml"
    rel_name = "xl/_rels/workbook.xml.rels" if nested else "ppt/slides/_rels/slide1.xml.rels"
    if mutation in {"uppercase_rels", "uppercase_rels_directory"}:
        parts.pop(rel_name)
        renamed = rel_name[:-5] + ".RELS" if mutation == "uppercase_rels" else rel_name.replace("/_rels/", "/_RELS/")
        parts[renamed] = relationships(("rId1", "hyperlink", "https://example.com/private", True))
    elif mutation == "duplicate_id":
        parts[rel_name] = relationships(("rId1", "hyperlink", "/" + source, False), ("rId1", "hyperlink", "/" + source, False))
    elif mutation == "xml_base":
        parts[rel_name] = parts[rel_name].replace('<Relationships ', '<Relationships xml:base="https://example.com/" ')
    elif mutation == "unknown_mode":
        parts[rel_name] = parts[rel_name].replace('<Relationship Id=', '<Relationship TargetMode="unknown" Id=')
    elif mutation == "nested_relationship":
        parts[rel_name] = parts[rel_name].replace('/>', '<Relationship Id="nested" Type="' + REL_NS + '/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationship>', 1)
    elif mutation == "hidden_xml":
        parts["payload.dat"] = '<!DOCTYPE x [<!ENTITY e "hidden">]><x>&e;</x>'
        types = parts["[Content_Types].xml"]
        if isinstance(types, bytes):
            types = types.decode()
        parts["[Content_Types].xml"] = types.replace('</Types>', '<Override PartName="/payload.dat" ContentType="application/xml"/></Types>')
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(chart_parts(archive(parts))) if nested else archive(parts))


@pytest.mark.parametrize("mutation", ["main_relationship", "chart_root", "chart_type", "dde_renamed"])
def test_workbook_and_chart_identity_cannot_be_spoofed(mutation):
    nested = workbook_parts()
    if mutation == "main_relationship":
        nested["_rels/.rels"] = relationships()
    elif mutation == "dde_renamed":
        nested["xl/harmless.xml"] = '<externalLink xmlns="' + SHEET_NS + '"><ddeLink ddeService="cmd" ddeTopic="evil"/></externalLink>'
    parts = chart_parts(archive(nested))
    if mutation == "chart_root":
        parts["ppt/charts/chart1.xml"] = parts["ppt/charts/chart1.xml"].replace('chartSpace', 'wrongRoot')
    elif mutation == "chart_type":
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace(CHART_TYPE, 'application/xml')
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(parts))


@pytest.mark.parametrize("mutation", ["duplicate", "symlink", "encrypted", "entry_count"])
def test_nested_zip_retains_archive_level_checks(mutation):
    nested = io.BytesIO(archive(workbook_parts()))
    if mutation in {"duplicate", "symlink"}:
        with zipfile.ZipFile(nested, "a") as package:
            if mutation == "duplicate":
                with pytest.warns(UserWarning):
                    package.writestr("xl/workbook.xml", workbook_parts()["xl/workbook.xml"])
            else:
                entry = zipfile.ZipInfo("xl/link")
                entry.create_system = 3
                entry.external_attr = 0o120777 << 16
                package.writestr(entry, "target")
        data = nested.getvalue()
    else:
        data = bytearray(nested.getvalue())
        if mutation == "encrypted":
            header = data.find(b'PK\x01\x02')
            struct.pack_into('<H', data, header + 8, 1)
        else:
            end = data.rfind(b'PK\x05\x06')
            struct.pack_into('<HH', data, end + 8, 65535, 65535)
        data = bytes(data)
    with pytest.raises(ValueError):
        ppt.validate_pptx(archive(chart_parts(data)))
