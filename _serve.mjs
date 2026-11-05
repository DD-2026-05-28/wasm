// 本地网页游戏启动器：起一个本地静态服务器（正确的 MIME），再用浏览器打开。
// 用法： node _serve.mjs [--port 8123] [--no-open] [--dir <游戏目录>]
// 说明： 这两个游戏是 wasm/Unity 网页版，必须通过 http:// 打开，
//        直接双击 index.html（file:// 协议）一定白屏 / 卡在 Loading。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const ROOT = path.resolve(getArg('dir', HERE));
const NO_OPEN = argv.includes('--no-open');
const START_PORT = Number(getArg('port', 8123));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.unityweb': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

const GAME_ID = encodeURIComponent(path.basename(ROOT));

const handler = (req, res) => {
  res.setHeader('x-local-game', GAME_ID);
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }
  // 有些游戏用 vue-router(history 模式)，访问 /index.html 会匹配不到路由 → 白屏。
  // 统一重定向到站点根目录，这样任何入口都能正常进入。
  if (urlPath === '/index.html' || urlPath === '/index.htm') {
    res.writeHead(302, { location: '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }).end();
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + urlPath);
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const size = st.size;
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = s === '' ? Math.max(0, size - Number(e)) : Number(s);
      const end = s === '' || e === '' ? size - 1 : Math.min(Number(e), size - 1);
      if (start >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': size,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
};

const listen = port => new Promise((resolve, reject) => {
  const srv = http.createServer(handler);
  srv.once('error', reject);
  srv.listen(port, '127.0.0.1', () => resolve(srv));
});

let server = null;
let port = START_PORT;
try {
  server = await listen(port);
} catch (e) {
  if (e.code !== 'EADDRINUSE') throw e;
  // 端口被占用：如果占用者就是同一个游戏的服务（多半是用户开了两个窗口），
  // 直接复用已有的服务地址，保证浏览器 origin 不变 —— 这样 IndexedDB 里的存档还在。
  let same = false;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' });
    same = r.headers.get('x-local-game') === GAME_ID;
  } catch { /* 占用者不是 http 服务，换端口 */ }
  if (same) {
    const u = `http://127.0.0.1:${port}/`;
    console.log('检测到本游戏的服务已经在运行：' + u);
    console.log('（同一个地址才能读到原来的存档，所以这里直接复用，不再另起一个端口）');
    if (!NO_OPEN) spawn('cmd', ['/c', 'start', '', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => process.exit(0), 1500);
    await new Promise(() => {});
  }
  for (let i = 1; i < 40 && !server; i++) {
    port = START_PORT + i;
    try { server = await listen(port); } catch { /* 继续找 */ }
  }
}
if (!server) {
  console.error('找不到空闲端口，启动失败。');
  process.exit(1);
}

const url = `http://127.0.0.1:${port}/`;
console.log('==============================================');
console.log('  游戏目录 : ' + ROOT);
console.log('  游戏地址 : ' + url);
console.log('  用法     : 浏览器访问上面的地址即可（别关这个窗口）');
console.log('  关闭     : 关掉这个黑色窗口 = 停止服务');
console.log('==============================================');

if (!NO_OPEN) {
  // Windows: 用系统默认浏览器打开
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
