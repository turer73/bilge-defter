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
