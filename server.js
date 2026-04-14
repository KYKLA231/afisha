import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5173);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === '/api/config') {
      return sendJson(res, 200, {
        supabaseUrl: envPublic('EVENTIX_SUPABASE_URL'),
        supabaseAnonKey: envPublic('EVENTIX_SUPABASE_ANON_KEY'),
      });
    }

    // Static files
    const filePath = toSafeFilePath(url.pathname);
    if (!filePath) return sendText(res, 400, 'Bad request');

    const resolved = path.join(__dirname, filePath);
    if (!resolved.startsWith(__dirname)) return sendText(res, 403, 'Forbidden');

    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isFile()) {
      return sendText(res, 404, 'Not found');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeByPath(resolved));
    createReadStream(resolved).pipe(res);
  } catch (e) {
    return sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`Eventix server running on http://localhost:${PORT}`);
  console.log(`Open: http://localhost:${PORT}/eventix.html`);
});

function envPublic(name) {
  const v = String(process.env[name] || '').trim();
  return v || null;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function toSafeFilePath(p) {
  let s = String(p || '/');
  if (s === '/' || s === '') s = '/eventix.html';
  s = decodeURIComponent(s);
  if (s.includes('\0')) return null;
  if (s.includes('..')) return null;
  if (s.startsWith('/')) s = s.slice(1);
  return s;
}

function contentTypeByPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  // Minimal .env parser: KEY=VALUE, supports quoted values.
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
