// Local-only adapter. Never deploy this server or its simulated identity publicly.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir, mkdir} from 'node:fs/promises';
import {resolve, dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {api} from '../server/worker.mjs';
import {prepareRenderer} from './prepare-renderer.mjs';
await prepareRenderer();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.STAR_CHAIN_LOCAL_PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('STAR_CHAIN_LOCAL_PORT 必须在 1024–65535 之间');
const dataDir = resolve(process.env.STAR_CHAIN_LOCAL_DATA || join(root, '.local'));
await mkdir(dataDir, {recursive: true});
const db = new DatabaseSync(join(dataDir, 'star-chain.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
for (const name of (await readdir(join(root, 'drizzle'))).filter(n => n.endsWith('.sql')).sort()) {
  const sql = await readFile(join(root, 'drizzle', name), 'utf8'), hash = createHash('sha256').update(sql).digest('hex');
  const old = db.prepare('SELECT hash FROM local_migrations WHERE name=?').get(name);
  if (old && old.hash !== hash) throw Error(`已经执行过的迁移被修改：${name}`);
  if (!old) {
    db.exec('BEGIN');
    try { db.exec(sql); db.prepare('INSERT INTO local_migrations VALUES (?,?)').run(name, hash); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
const env = {DB: {prepare(sql) {
  return {bind(...args) {
    const statement = db.prepare(sql);
    return {run: async () => ({meta: {changes: Number(statement.run(...args).changes)}}),
      first: async () => statement.get(...args) || null, all: async () => ({results: statement.all(...args)})};
  }};
}}};
const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.wav':'audio/wav','.hdr':'application/octet-stream'};
const server = createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {res.writeHead(403).end('仅允许本机访问'); return;}
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      let size = 0; const chunks = [];
      for await (const chunk of req) {size += chunk.length; if (size > 524288) {res.writeHead(413).end('记录过大'); return;} chunks.push(chunk);}
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(`http://${req.headers.host}${req.url}`, {method: req.method, headers,
        ...(['GET','HEAD'].includes(req.method) ? {} : {body: Buffer.concat(chunks)})});
      const response = await api(request, env, 'local-development-player');
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end(); return;}
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!(/^\/[a-zA-Z0-9_.-]+\.(html|mjs|css)$/.test(pathname) || /^\/assets\/[a-zA-Z0-9_.-]+\.(png|jpg|svg|glb|wav|hdr|json|js|css)$/.test(pathname))) {res.writeHead(404).end(); return;}
    const file = await readFile(join(root, process.env.STAR_CHAIN_BUILT==='1'?'dist/client':'dist', pathname));
    res.writeHead(200, {'content-type': mime[extname(pathname)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch (e) {res.writeHead(e.code === 'ENOENT' ? 404 : 500).end('本地服务请求失败');}
});
server.listen(port, '127.0.0.1', () => console.log(`星链算式本地开发：http://127.0.0.1:${port}\n记录保存在 ${join(dataDir, 'star-chain.sqlite')}，采用固定开发身份。禁止公开此服务。`));
const stop = () => server.close(() => {db.close(); process.exit(0);});
process.on('SIGINT', stop); process.on('SIGTERM', stop);
