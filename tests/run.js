#!/usr/bin/env node
/* Runs the suites.
 *
 *   node tests/run.js            every regression suite
 *   node tests/run.js pwa div    just the ones whose names match
 *   node tests/run.js --list     what is available and what each one covers
 *
 * Starts the two static servers the suites need and shuts them down at the end,
 * because half the failures in this project's history were a suite pointed at a
 * port with nothing behind it, reported as though the app were broken.
 *
 * Needs Playwright and a Chromium:
 *
 *   npm install -g playwright && npx playwright install chromium
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CFG = require('./config');

/* Split out because they answer different questions. The regression set is what
 * you run after changing anything. The tools are slow and only worth running
 * when you are deliberately retuning the model. */
const SUITES = [
  ['v2-test', 'page structure, glossary terms, a full run end to end'],
  ['smoke', 'broad smoke test, model calibration, and the IRR definition'],
  ['bundle-test', 'the single-file dist/ bundle still plays a whole game'],
  ['pwa-test', 'service worker registers, manifest is valid, offline reload works'],
  ['mobile-pwa', 'phone layout, no horizontal scroll, offline on mobile'],
  ['subpath', 'served from a subdirectory, the way GitHub Pages does it'],
  ['swver', 'an updated page never runs scripts left in an old cache'],
  ['chipall', 'every "see also" link in the glossary actually navigates'],
  ['board', 'result codes round-trip, tampering is rejected, leaderboard ranks'],
  ['comp', 'competition mode against each AI opponent'],
  ['econ', 'the economy panel, GDP, and the four phases of the cycle'],
  ['div', 'dividends are paid, shown per company, and explained'],
  ['disc', 'the disclaimer and what the app says it leaves out'],
  ['panel', 'the asset detail panel: hover, pin, keyboard, viewport edges'],
  ['fourth', 'the targeted "sell just the crypto" crash option'],
  ['intro-test', 'the opening briefing, on desktop and on a phone'],
  ['hunt', 'edge cases: no goal, tiny balances, fuzzed clicking'],
  ['hunt2', 'model fuzz — 400 runs, asserting invariants every month'],
  ['uifuzz3', 'UI fuzz — a full run clicking real controls, scanning for junk']
];

const TOOLS = [
  ['calibrate', 'do realised returns match each asset\'s stated expectation?'],
  ['seedcheck', 'where a seed sits in the distribution of possible markets'],
  ['pickseed5', 'search thousands of seeds for a good teaching market (slow)'],
  ['ladder', 'are the AI opponents actually ordered easy < medium < hard?'],
  ['bots', 'what each opponent does over many runs']
];

function serve(root, port) {
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json',
    '.json': 'application/json', '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    // Query strings matter to this app (?v= cache busting) but not to the disk.
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    // Never serve outside the root, even if a test asks for ../
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

function runOne(name) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, name + '.js')], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    child.on('close', code => resolve({ name: name, code: code, out: out }));
  });
}

(async () => {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('\nRegression suites — run these after any change:\n');
    SUITES.forEach(s => console.log('  ' + s[0].padEnd(14) + s[1]));
    console.log('\nTuning tools — slow, for deliberately retuning the model:\n');
    TOOLS.forEach(s => console.log('  ' + s[0].padEnd(14) + s[1]));
    console.log('');
    return;
  }

  const filters = args.filter(a => !a.startsWith('-'));
  const all = SUITES.concat(args.includes('--tools') ? TOOLS : []);
  const chosen = filters.length
    ? all.filter(s => filters.some(f => s[0].includes(f)))
    : all;

  if (!chosen.length) {
    console.log('Nothing matched. Try: node tests/run.js --list');
    process.exitCode = 1;
    return;
  }

  const servers = [
    await serve(CFG.root, CFG.PORT),
    await serve(path.dirname(CFG.root), CFG.SUBPATH_PORT)
  ];

  const failures = [];
  for (const [name, what] of chosen) {
    process.stdout.write('  ' + name.padEnd(14));
    const r = await runOne(name);
    /* Every suite prints "ERRORS: none" when clean, so a run that says nothing
     * about errors is a run that fell over before it got there. */
    const clean = r.code === 0 && !/ERRORS: (?!none)/.test(r.out);
    console.log(clean ? 'ok' : 'FAILED');
    if (!clean) failures.push(r);
  }

  servers.forEach(s => s.close());

  if (failures.length) {
    failures.forEach(f => {
      console.log('\n----- ' + f.name + ' -----\n' + f.out.trim().split('\n').slice(-25).join('\n'));
    });
    console.log('\n' + failures.length + ' of ' + chosen.length + ' failed.');
    process.exitCode = 1;
  } else {
    console.log('\nAll ' + chosen.length + ' passed.');
  }
})();
