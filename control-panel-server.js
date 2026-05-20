const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'control-panel');
const port = Number(process.env.XIAOQINGLONG_PANEL_PORT || 43174);
const host = '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, headers, body) {
  res.writeHead(status, {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    'pragma': 'no-cache',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const target = path.normalize(path.join(root, pathname));
    if (!target.startsWith(root + path.sep)) {
      send(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'forbidden');
      return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'not found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    send(res, 200, { 'content-type': types[ext] || 'application/octet-stream' }, fs.readFileSync(target));
  } catch (error) {
    send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, error.message || String(error));
  }
});

server.listen(port, host, () => {
  console.log(`xiaoqinglong-control-panel listening http://${host}:${port}/`);
});
