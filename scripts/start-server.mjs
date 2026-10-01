import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, realpathSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, relative, join, extname, sep } from 'node:path';
import { performance } from 'node:perf_hooks';

const project = realpathSync(process.env.PROJECT_DIR || process.cwd());
const directory = realpathSync(join(project, 'dist'));
const inside = relative(project, directory);
if (!inside || inside.startsWith(`..${sep}`) || inside === '..' || resolve(directory) === resolve(project)) {
  throw new Error('Built output must be a directory inside PROJECT_DIR.');
}
if (!existsSync(join(directory, 'index.html'))) throw new Error('Missing dist/index.html after build.');
const metadata = process.env.OPENCODE_WEB_DIR || '/home/runner/work/_temp/omgithub-web';
let started = performance.now();
mkdirSync(metadata, { recursive: true });
const temporary = join(metadata, `deployment-output.${process.pid}.tmp`);
writeFileSync(temporary, JSON.stringify({ project, directory }));
renameSync(temporary, join(metadata, 'deployment-output.json'));
console.log(`[timing] publish deployment metadata: ${(performance.now() - started).toFixed(1)} ms`);

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    let file = resolve(directory, `.${decodeURIComponent(url.pathname)}`);
    if (file !== directory && !file.startsWith(directory + sep)) throw new Error('Invalid path.');
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    file = realpathSync(file);
    if (!file.startsWith(directory + sep)) throw new Error('Invalid resolved path.');
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error('Not a file.');
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found');
  }
});
server.on('error', error => { console.error(error); process.exitCode = 1; });
started = performance.now();
server.listen(port, '0.0.0.0', () => {
  console.log(`[timing] listen on PORT ${port}: ${(performance.now() - started).toFixed(1)} ms`);
  console.log(`Serving ${directory} at http://0.0.0.0:${port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
