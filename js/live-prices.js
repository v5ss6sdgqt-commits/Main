/* Fetches real starting prices from the backend, once, in the background.
 *
 * This is the one piece of the app that touches the network — everything else
 * about the simulation is self-contained on purpose (see market.js). That
 * matters here too: a slow or unreachable backend must never stop a student
 * from playing, so nothing in this file is ever awaited without a timeout,
 * and every failure path lands on "just use the usual default price."
 *
 * The backend only knows real tickers for 15 of the 16 assets — asking it
 * about the one that doesn't exist (the KiwiSaver fund) is expected to fail,
 * not a bug to chase. */

(function (global) {
  'use strict';

  const BACKEND = 'https://marketlab-backend.onrender.com';
  const FETCH_TIMEOUT_MS = 6000;

  // Filled in as responses arrive; read synchronously by anyone who doesn't
  // want to wait, so a fast page (or a slow backend) never blocks on this.
  const prices = {};
  let started = false;
  let allSettledPromise = null;

  function fetchOne(assetId) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller && setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    return fetch(BACKEND + '/api/stocks/' + assetId + '/current-price', {
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && typeof data.price === 'number' && data.price > 0) {
          prices[assetId] = data.price;
        }
      })
      .catch(function () {
        // Expected for kiwisaver, and for anything else if the backend is
        // asleep, offline, or having a bad day. Silence is the correct
        // response — the caller falls back to the static price either way.
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  // Kicks off every fetch immediately, in parallel, as soon as this script
  // runs — well before a student has picked a seed or clicked anything, so
  // the results are as likely as possible to be ready by the time they do.
  function start() {
    if (started) return allSettledPromise;
    started = true;
    const jobs = global.Market.ASSETS.map(function (a) {
      return fetchOne(a.id);
    });
    allSettledPromise = Promise.all(jobs);
    return allSettledPromise;
  }

  /* Resolves with whatever real prices are available right now — waiting up
   * to `maxWaitMs` for in-flight fetches, then giving up and returning
   * partial (or empty) results rather than leaving a student staring at a
   * loading screen because one asset's request is slow. */
  function ready(maxWaitMs) {
    const fetches = start();
    const timeout = new Promise(function (resolve) {
      setTimeout(resolve, maxWaitMs);
    });
    return Promise.race([fetches, timeout]).then(function () {
      // A shallow copy: callers get a snapshot, not a reference that keeps
      // changing under them if a slower request resolves moments later.
      return Object.assign({}, prices);
    });
  }

  global.LivePrices = {
    start: start,
    ready: ready
  };

  // Begins the moment this script runs, not the moment something asks for a
  // result — by the time a student has clicked anything, this has already
  // had a head start most of a second or more long.
  start();
})(window);
