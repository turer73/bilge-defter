'use strict';
// Deliberately loopback-only and allowlisted. Never serves a chosen PPTX,
// notebook, output directory, account configuration, or arbitrary repo file.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some(value => !/^--port=\d+$/.test(value)) || args.length > 1) throw Error('Usage: node tools/serve-pptx-pilot.cjs [--port=8775]');
const port = args.length ? Number(args[0].slice(7)) : 8775;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
execFileSync(process.execPath, [path.join(__dirname, 'prepare-pptx-pilot.cjs'), '--check'], {stdio: 'inherit'});
const pilot = path.join(root, 'work', 'pptx-pilot');
const provenance = JSON.parse(fs.readFileSync(path.join(pilot, 'vendor', 'PROVENANCE.json'), 'utf8'));
const assets = new Map();
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'};
for (const file of ['index.html', 'host.js', 'host.css', 'model.js', 'store.js', 'renderer-bridge.js', 'renderer-frame.html']) {
  assets.set('/' + file, {body: fs.readFileSync(path.join(pilot, file)), type: types[path.extname(file)]});
}
const common = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' '"+provenance.runtimeIntegrity+"' '"+provenance.frameIntegrity+"'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src data: blob:; font-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store, no-transform',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const server = http.createServer((req, res) => {
  const actualPort = server.address().port;
  const hostAllowed = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(req.headers.host);
  const name = req.url === '/' ? '/index.html' : req.url;
  const asset = hostAllowed && ['GET', 'HEAD'].includes(req.method) && assets.get(name);
  const headers = {...common, 'Content-Type': asset ? asset.type : 'text/plain; charset=utf-8'};
  if (asset && name === '/renderer-frame.html') headers['Content-Security-Policy'] = provenance.csp;
  const body = asset ? asset.body : Buffer.from('Not found');
  res.writeHead(asset ? 200 : 404, {...headers, 'Content-Length': body.length});
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? 'Bu port kullanımda. Başka bir --port seçin; port değişirse tarayıcı kayıtları ayrıdır.' : 'Yerel pilot başlatılamadı.');process.exitCode = 1;});
server.listen(port, '127.0.0.1', () => console.log(`Yerel PowerPoint pilotu: http://127.0.0.1:${server.address().port}/\nYalnız bu bilgisayar. Durdurmak için Ctrl+C. Notlar aynı tarayıcı ve adreste saklanır.`));
