// Local-only dev server: serves api/*.ts files as Vercel-style serverless
// handlers without contacting Vercel cloud. Handlers stay written against the
// Vercel signature (export default (req, res) => ...) so they remain portable
// to a real `vercel dev` / deployment with no code changes.
//
// Routing: api/<name>.ts  ->  GET/POST/... /api/<name>
// Run:     dotenv -e .env.staging -- cross-env PORT=3000 node scripts/dev-server.mjs

import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const API_DIR = join(process.cwd(), 'api');

// Map api/*.ts -> /api/<name>
const routes = {};
for (const file of readdirSync(API_DIR)) {
  if (file.endsWith('.ts')) {
    routes[`/api/${basename(file, '.ts')}`] = join(API_DIR, file);
  }
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.headersSent) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
    return res;
  };
  return res;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = createServer(async (req, res) => {
  decorateResponse(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handlerPath = routes[url.pathname];

  if (!handlerPath) {
    res.status(404).json({ error: 'Not found', path: url.pathname });
    return;
  }

  try {
    req.query = Object.fromEntries(url.searchParams);
    req.body = await readBody(req);
    const mod = await import(pathToFileURL(handlerPath).href);
    await mod.default(req, res);
  } catch (err) {
    console.error(`Handler error for ${url.pathname}:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`Local API (${process.env.APP_ENV ?? 'unknown'}) on http://localhost:${PORT}`);
  console.log(`Routes: ${Object.keys(routes).join(', ') || '(none)'}`);
});
