const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env if present (zero dependencies)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const creditsHandler = require('../api/credits');
const timetableHandler = require('../api/timetable');
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function attachResHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);

  if (urlObj.pathname === '/api/credits') {
    attachResHelpers(res);
    await creditsHandler(req, res);
    return;
  }

  if (urlObj.pathname === '/api/timetable') {
    attachResHelpers(res);
    await timetableHandler(req, res);
    return;
  }

  let relPath = urlObj.pathname === '/' ? 'graduation-credits/index.html' : urlObj.pathname.replace(/^\/+/, '');
  let filePath = path.join(publicDir, relPath);

  if (filePath.startsWith(publicDir) && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
  console.log(`Credit Tracker (Demo): http://localhost:${PORT}/?demo=1&theme=dark`);
  console.log(`Timetable (Demo):      http://localhost:${PORT}/timetable?demo=1`);
});
