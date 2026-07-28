/* Bootstrap and event wiring. */

(function () {
  'use strict';

  const $ = UI.$;

  /* Picked by scanning seeds for a representative first run rather than a
   * flattering one: the index compounds at 9.3% (its median decade), bonds at
   * 4.4%, and there is a 36% crash in the middle to sit through. Bitcorn manages
   * 10.5% — ahead of the index but barely, despite five times the volatility,
   * which is a more honest lesson than a decade where the risky bet paid off.
   * An earlier candidate was rejected for ending with Bitcorn at $0.06, a
   * roughly 1-in-4000 draw that reads as a broken simulation rather than a tail. */
  const DEFAULT_SEED = 'classroom-182';

  let state = null;
  let chart = null;

  function newGame(seed, years) {
    const months = years * Market.MONTHS_PER_YEAR;
    const market = Market.generate(seed, months);
    state = Portfolio.create(market);
    UI.buildMarketRows(state, { onTrade: onTrade });
    UI.renderBanner(state, null);
    setNotice('');
    renderAll();
  }

  function renderAll() {
    UI.renderHeader(state);
    UI.renderHero(state);
    UI.renderTiles(state);
    UI.renderAllocation(state);
    UI.updateMarket(state);
    UI.renderFeed(state);
    UI.renderChartTable(state);
    UI.renderResults(state);
    drawChart();
  }

  function drawChart() {
    const cfg = {
      series: UI.chartSeries(state),
      onHover: function (idx) {
        UI.showTooltip(state, idx);
      }
    };
    if (!chart) {
      chart = Charts.line($('main-chart'), cfg);
      chart.draw();
    } else {
      chart.update(cfg);
    }
  }

  function setNotice(text) {
    $('trade-notice').textContent = text || '';
  }

  function onTrade(kind, assetId, amount) {
    if (!isFinite(amount) || amount <= 0) {
      setNotice('Enter an amount in dollars first.');
      return;
    }
    const result = kind === 'buy' ? Portfolio.buy(state, assetId, amount) : Portfolio.sell(state, assetId, amount);
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    // A partial fill is worth saying out loud — the student asked for more than
    // they had, and silently trading less would look like a bug.
    setNotice(
      result.amount < amount - 0.005
        ? 'Only ' + UI.money(result.amount, 2) + ' was available, so that is what was traded.'
        : ''
    );
    renderAll();
  }

  function step(count) {
    let lastEvent = null;
    for (let i = 0; i < count; i++) {
      if (state.finished) break;
      const ev = Portfolio.advance(state);
      if (ev) lastEvent = ev;
    }
    UI.renderBanner(state, lastEvent);
    setNotice('');
    renderAll();
    if (state.finished) {
      $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ---------------- theme ---------------- */

  function applyTheme(mode) {
    if (mode) document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
    // Canvas colors are baked in at draw time, so a theme change needs a redraw.
    if (state) {
      drawChart();
      UI.updateMarket(state);
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme');
  }

  function toggleTheme() {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const now = currentTheme() || (prefersDark ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('marketlab-theme', next);
    } catch (e) {
      /* private browsing — the toggle still works for this session */
    }
    applyTheme(next);
  }

  function restoreTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem('marketlab-theme');
    } catch (e) {
      saved = null;
    }
    if (saved === 'dark' || saved === 'light') applyTheme(saved);
  }

  /* ---------------- installing as an app ---------------- */

  /* Service workers are refused on file:// URLs, so this only runs when the app
   * is actually being served. Opening index.html straight off disk still works
   * — it just doesn't get the offline cache or the install prompt. */
  function registerServiceWorker() {
    const servedOverHttp = location.protocol === 'http:' || location.protocol === 'https:';
    if (!servedOverHttp || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        /* Offline support is a bonus; the app is fully usable without it. */
      });
    });
  }

  /* Chrome and Edge fire beforeinstallprompt when the app qualifies for
   * installation, and require the prompt be triggered by a real click — so the
   * event is stashed and replayed from the button. Safari and Firefox never fire
   * it, and the button simply stays hidden. */
  function setupInstall() {
    let deferred = null;
    const btn = $('install-btn');

    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      deferred = ev;
      btn.hidden = false;
    });

    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () {
        deferred = null;
        btn.hidden = true;
      });
    });

    window.addEventListener('appinstalled', function () {
      deferred = null;
      btn.hidden = true;
    });
  }

  /* ---------------- wiring ---------------- */

  function restart() {
    const seed = $('seed-input').value.trim() || DEFAULT_SEED;
    const years = parseInt($('years-input').value, 10) || 10;
    newGame(seed, years);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function randomSeed() {
    return 'run-' + Math.random().toString(36).slice(2, 8);
  }

  registerServiceWorker();

  document.addEventListener('DOMContentLoaded', function () {
    restoreTheme();
    setupInstall();

    $('next-month').addEventListener('click', function () {
      step(1);
    });
    $('next-year').addEventListener('click', function () {
      step(12);
    });
    $('restart-btn').addEventListener('click', restart);
    $('theme-btn').addEventListener('click', toggleTheme);

    $('again-btn').addEventListener('click', function () {
      $('seed-input').value = randomSeed();
      restart();
    });

    $('table-toggle').addEventListener('click', function () {
      const table = $('chart-table');
      const showing = !table.hidden;
      table.hidden = showing;
      this.textContent = showing ? 'Show as table' : 'Hide table';
      this.setAttribute('aria-expanded', String(!showing));
    });

    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state) {
          drawChart();
          UI.updateMarket(state);
        }
      }, 120);
    });

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = function () {
        if (!currentTheme() && state) {
          drawChart();
          UI.updateMarket(state);
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    newGame($('seed-input').value.trim() || DEFAULT_SEED, 10);
  });
})();
