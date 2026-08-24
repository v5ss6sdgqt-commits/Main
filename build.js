#!/usr/bin/env node
/* Bundles the app into one self-contained HTML file.
 *
 * The multi-file version is the one to work on; this output is for handing out.
 * A single file can be emailed to a class, dropped on a shared drive or opened
 * from a USB stick, with no folder structure to keep intact and nothing to load
 * over the network.
 *
 *   node build.js              -> dist/market-lab.html  (a complete document)
 *   node build.js --fragment   -> dist/market-lab.fragment.html
 *
 * The fragment form omits the doctype and the html/head/body wrapper, for hosts
 * that supply their own document shell. */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const fragment = process.argv.includes('--fragment');

const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// A function replacement keeps `$&` and friends in the file contents literal.
function replaceOnce(source, pattern, text) {
  if (!pattern.test(source)) {
    throw new Error('Bundle failed: nothing matched ' + pattern);
  }
  return source.replace(pattern, () => text);
}

/* The manifest and icon links point at sibling files that a lone HTML file has
 * no way to resolve, so they come out. The service worker registration can stay
 * — it checks the protocol and no-ops on file:// URLs. */
html = replaceOnce(html, /<!-- pwa:start[\s\S]*?pwa:end -->\n?/, '');

/* The `?v=` on every asset URL is the cache-busting version described in sw.js.
 * It is irrelevant to a single inlined file, so the patterns below tolerate it
 * rather than requiring it — and `replaceOnce` throws if one stops matching, so
 * a change to those tags can never silently produce a half-bundled file. */
/* The stylesheet references font files as sibling paths, which resolve fine
 * for the served app but mean nothing once inlined into a single document
 * with no folder structure around it — so those become data URIs here,
 * exactly the same reasoning as everything else in this file. */
let css = read('css/styles.css');
css = css.replace(/url\('\.\.\/fonts\/([\w.-]+\.woff2)'\)/g, (match, filename) => {
  const font = fs.readFileSync(path.join(root, 'fonts', filename)).toString('base64');
  return `url(data:font/woff2;base64,${font})`;
});
html = replaceOnce(
  html,
  /<link rel="stylesheet" href="css\/styles\.css(\?[^"]*)?">/,
  '<style>\n' + css + '\n</style>'
);

// Order matters — the modules assign to globals and app.js reads them all.
['rng', 'market', 'portfolio', 'goals', 'opponents', 'share', 'charts', 'asset-panel', 'intro', 'ui', 'glossary', 'account', 'leaderboard', 'app'].forEach(name => {
  const js = read('js/' + name + '.js');
  html = replaceOnce(
    html,
    new RegExp('<script src="js/' + name + '\\.js(\\?[^"]*)?"></script>'),
    '<script>\n' + js + '\n</script>'
  );
});

if (fragment) {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html);
  const style = /<style>[\s\S]*?<\/style>/.exec(html);
  const body = /<body>([\s\S]*?)<\/body>/.exec(html);
  if (!title || !style || !body) throw new Error('Bundle failed: could not split the document');
  html = '<title>' + title[1] + '</title>\n' + style[0] + '\n' + body[1].trim() + '\n';
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outName = fragment ? 'market-lab.fragment.html' : 'market-lab.html';
fs.writeFileSync(path.join(outDir, outName), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('Wrote dist/' + outName + ' (' + kb + ' KB, no external requests)');
