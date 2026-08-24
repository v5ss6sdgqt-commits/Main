/* Where the suites point.
 *
 * These scripts were written against a container with hardcoded ports and
 * absolute paths, which made them useless anywhere else. Everything is derived
 * here instead, so a checkout on any machine runs unchanged.
 *
 * `run.js` starts the servers these describe. To point a suite at something
 * else — a deployed site, say — set BASE and run it directly:
 *
 *   BASE=https://v5ss6sdgqt-commits.github.io/Main node tests/pwa-test.js
 */

const path = require('path');

const PORT = process.env.PORT || 8123;
const SUBPATH_PORT = process.env.SUBPATH_PORT || 8901;

// Trailing slashes are a common source of double-slash URLs, so strip one here
// rather than in twenty call sites.
const BASE = (process.env.BASE || 'http://localhost:' + PORT).replace(/\/$/, '');

const root = path.join(__dirname, '..');

module.exports = {
  PORT: PORT,
  SUBPATH_PORT: SUBPATH_PORT,
  root: root,

  // The app as it is actually served — the only way to exercise the service
  // worker, which browsers refuse to register on file:// URLs.
  APP: BASE + '/index.html',

  /* The single-file bundle, opened straight off disk. That is how a teacher
   * handed a copy on a USB stick will open it, so testing it any other way
   * would be testing something nobody does. */
  BUNDLE: 'file://' + path.join(root, 'dist', 'market-lab.html'),

  /* GitHub Pages serves this repo from /Main/, not from the domain root. Every
   * relative URL, the service worker's scope and the manifest all behave
   * differently one level down, so this is the check that actually matches
   * production. `run.js` serves the parent directory to reproduce it. */
  SUBPATH: 'http://127.0.0.1:' + SUBPATH_PORT + '/' + path.basename(root) + '/',

  // Skips the opening briefing, which otherwise blocks every click behind a
  // modal backdrop. Pass to page.addInitScript.
  skipIntro: function () {
    try {
      localStorage.setItem('marketlab-intro-seen', '1'); localStorage.setItem('marketlab_gate_bypass','1');
    } catch (e) {
      /* file:// denies localStorage in some browsers; the intro just shows */
    }
  }
};
