#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const PORT = 3000;
const SETTINGS_DIR = path.join(os.homedir(), '.config', 'logview');
const SETTINGS_PATH = path.join(SETTINGS_DIR, 'settings.json');

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const DEFAULT_SETTINGS = { db: '', table: '', timeColumn: '', rows: [] };

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
if (!fs.existsSync(SETTINGS_PATH)) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

function resolveDb(dbStr) {
  if (!dbStr) return '';
  return path.isAbsolute(dbStr) ? dbStr : path.join(__dirname, dbStr);
}

function openDb(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
  return openDb(dbPath);
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  if (pathname === '/data' && req.method === 'GET') {
    const s = loadSettings();
    if (!s.table || !s.timeColumn) { json(res, []); return; }
    try {
      const db = openDb(resolveDb(s.db));
      const rows = db.prepare(`SELECT * FROM "${s.table}" ORDER BY "${s.timeColumn}"`).all();
      const tc = s.timeColumn;
      rows.forEach(r => { if (typeof r[tc] === 'string') r[tc] = r[tc].slice(0, 16); });
      json(res, rows);
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  if (pathname === '/settings' && req.method === 'GET') {
    const s = loadSettings();
    json(res, { ...s, db: resolveDb(s.db) });
    return;
  }

  if (pathname === '/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const settings = JSON.parse(body);
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        json(res, { ok: true });
      } catch (e) {
        json(res, { error: e.message }, 400);
      }
    });
    return;
  }

  if (pathname === '/tables' && req.method === 'GET') {
    try {
      const s = loadSettings();
      const dbParam = urlObj.searchParams.get('db');
      const dbPath = dbParam ? resolveDb(dbParam) : resolveDb(s.db);
      const db = openDb(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      json(res, tables.map(t => t.name));
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  if (pathname === '/sample' && req.method === 'GET') {
    const table = urlObj.searchParams.get('table');
    const column = urlObj.searchParams.get('column');
    const dbParam = urlObj.searchParams.get('db');
    if (!table || !column || !/^[\w ]+$/.test(table) || !/^[\w ]+$/.test(column)) {
      json(res, { error: 'Invalid parameters' }, 400);
      return;
    }
    try {
      const s = loadSettings();
      const dbPath = dbParam ? resolveDb(dbParam) : resolveDb(s.db);
      const db = openDb(dbPath);
      const row = db.prepare(`SELECT "${column}" as val FROM "${table}" WHERE "${column}" IS NOT NULL LIMIT 1`).get();
      json(res, { value: row ? row.val : null });
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  if (pathname === '/columns' && req.method === 'GET') {
    const table = urlObj.searchParams.get('table');
    const dbParam = urlObj.searchParams.get('db');
    if (!table || !/^[\w ]+$/.test(table)) {
      json(res, { error: 'Invalid table name' }, 400);
      return;
    }
    try {
      const s = loadSettings();
      const dbPath = dbParam ? resolveDb(dbParam) : resolveDb(s.db);
      const db = openDb(dbPath);
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
      json(res, cols.map(c => c.name));
    } catch (e) {
      json(res, { error: e.message }, 500);
    }
    return;
  }

  const filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
