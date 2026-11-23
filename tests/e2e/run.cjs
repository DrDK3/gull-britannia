// Runs every end-to-end suite (tests/e2e/*.e2e.cjs) against the built game.
//
//   npm run build && npm run e2e          serves dist/ with `vite preview` on a free port, then runs the suites
//   npm run e2e -- http://127.0.0.1:4173/  uses a server that is already running
//   npm run e2e -- --only missions         runs the suites whose file name contains "missions"
//
// Each suite is a Node script that takes the URL as its first argument and exits non-zero on failure.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? args[onlyAt + 1] : undefined;
const givenUrl = args.find((a) => /^https?:/.test(a));
const PORT = 4173 + Math.floor(Math.random() * 400);

function waitFor(url, ms) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on('error', retry);
    };
    const retry = () => (Date.now() - t0 > ms ? reject(new Error(`server did not answer at ${url}`)) : setTimeout(tick, 300));
    tick();
  });
}

function run(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, cmdArgs, { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

(async () => {
  const root = path.resolve(__dirname, '../..');
  let server;
  let url = givenUrl;
  if (!url) {
    if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
      console.error('dist/ is missing: run `npm run build` first.');
      process.exit(1);
    }
    const vite = path.join(root, 'node_modules/vite/bin/vite.js');
    server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
    url = `http://127.0.0.1:${PORT}/`;
    await waitFor(url, 20000);
  }
  const suites = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.e2e.cjs') && (!only || f.includes(only)))
    .sort();
  let failed = 0;
  for (const s of suites) {
    console.log(`\n=== ${s}`);
    const code = await run(process.execPath, [path.join(__dirname, s), url]);
    if (code !== 0) failed++;
  }
  server?.kill();
  console.log(`\n${suites.length - failed} of ${suites.length} end-to-end suites passed`);
  process.exit(failed ? 1 : 0);
})();
