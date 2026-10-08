# PDF rendering dependency

- PDF.js / pdfjs-dist 6.3.289, Mozilla contributors, Apache-2.0; LICENSE retained under vendor/pdfjs.
- Registry archive: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz
- Verified archive integrity: sha512-ZHjSVpDa3D6izMq8/04lvkhkATUmL9px6ChPaXc1k6nU2Mrhlg1/7F0bdUqCwUjw3NsPTfPZsMDUU6ZIcRaeQw==
- Legacy browser build and matching worker, cmaps, standard_fonts, wasm copied without install scripts. Minified .mjs files renamed .js for the existing nginx MIME mapping; contents unchanged.
- Usage references: https://mozilla.github.io/pdf.js/examples/ and https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- Test sample only, not shipped: https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf

The application sends document bytes directly to a local PDF.js worker. No viewer scripting or interactive annotation layer is instantiated. XFA is disabled. Only static rendered PNG page images are stored, alongside separate user ink.
## Native PowerPoint reader (v76)

The optional native reader uses @aiden0z/pptx-renderer 1.3.0 (Apache-2.0),
with bundled third-party components. Complete upstream license, dependency
notices, MPL-2.0 text and ECMA text notice are distributed in
[`pptx/NOTICES.txt`](pptx/NOTICES.txt). The renderer is pinned and reproducibly
adapted to a self-contained sandboxed frame; provenance and changes are in
`work/pptx-pilot/vendor/PROVENANCE.json` and `tools/prepare-pptx-pilot.cjs`.

## Interface icons: Tabler Icons 3.49.0

39 outline SVGs are included as inline geometry in `ui-v2/bilge-defter-ui.js`.
Source: https://github.com/tabler/tabler-icons/tree/v3.49.0/icons/outline
Release: https://github.com/tabler/tabler-icons/releases/tag/v3.49.0
Only SVG child geometry is retained; default stroke width is 1.8 rather than 2.
No external icon font, runtime CDN request or application dependency is added.
The original Bilge Defter logo and installation icons are unchanged.

```
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
