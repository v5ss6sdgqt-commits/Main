/* Bootstrap and event wiring. */

(function () {
  'use strict';

  const $ = UI.$;

  /* The one seed out of 6,000 that satisfied every constraint below, chosen for
   * being representative rather than flattering.
   *
   * Required: the world fund lands near its 8% expectation (7.0% here), there is
   * a real crash to sit through (-33%), bonds and the NZX 50 behave, at least
   * three headline events fire, no asset finishes at an absurd rate, and nothing
   * falls further than about 87% — deeper than crypto has ever actually gone
   * reads as a broken simulation rather than a fair tail.
   *
   * What makes this decade worth teaching is how it turned out. The boring NZX
   * 50 fund returns 10.6% and beats almost everything. Nvidia, Xero and a2 Milk
   * all finish *negative*. Bitcoin manages 6.2% — below the world fund, after an
   * 87% fall on the way. And the single best performer is Air New Zealand at
   * 18.9%: the company with the worst real history on the board, which no
   * student would ever have picked. A decade where the exciting bets paid off
   * would teach the precise opposite of what this app is for. */
  const DEFAULT_SEED = 'classroom-2910';

  let state = null;
  let chart = null;

  function newGame(seed, years) {
    stopPlaying();
    const months = years * Market.MONTHS_PER_YEAR;
    const market = Market.generate(seed, months);
    state = Portfolio.create(market);
    UI.buildMarketRows(state, { onTrade: onTrade });
    UI.renderBanner(state, null);
    setNotice('');
    renderAll();
    reflectPlayState();
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
    // Deciding to trade means you want to look at this month, not the next one.
    stopPlaying();
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
    let sawBigEvent = false;
    for (let i = 0; i < count; i++) {
      if (state.finished) break;
      const ev = Portfolio.advance(state);
      if (ev) {
        lastEvent = ev;
        if (ev.big) sawBigEvent = true;
      }
    }
    UI.renderBanner(state, lastEvent);
    setNotice('');
    renderAll();
    if (state.finished) {
      stopPlaying();
      $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return sawBigEvent;
  }

  /* ---------------- auto-play ---------------- */

  /* Runs the simulation on its own so a student can watch ten years happen
   * rather than clicking 120 times. It pauses itself on a crash or a recovery:
   * those are the moments worth reacting to, and sailing past them unnoticed
   * would waste the most interesting thing that happens in a run. */
  let timer = null;

  function isPlaying() {
    return timer !== null;
  }

  function currentSpeed() {
    return parseInt($('speed-input').value, 10) || 450;
  }

  function tick() {
    if (state.finished) {
      stopPlaying();
      return;
    }
    const big = step(1);
    if (big) {
      stopPlaying();
      setNotice('Paused — something big just happened. Read the headline, then decide what to do.');
    }
  }

  function startPlaying() {
    if (isPlaying() || state.finished) return;
    timer = setInterval(tick, currentSpeed());
    reflectPlayState();
  }

  function stopPlaying() {
    if (!isPlaying()) return;
    clearInterval(timer);
    timer = null;
    reflectPlayState();
  }

  function togglePlaying() {
    if (isPlaying()) stopPlaying();
    else startPlaying();
  }

  function reflectPlayState() {
    const btn = $('play-btn');
    const playing = isPlaying();
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-pressed', String(playing));
    $('play-label').textContent = playing ? 'Pause' : state.month > 0 ? 'Keep going' : 'Run the simulation';
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

    Glossary.attach(function () {
      return state;
    });

    $('play-btn').addEventListener('click', togglePlaying);

    // Changing speed mid-run should take effect now, not after a pause.
    $('speed-input').addEventListener('change', function () {
      if (isPlaying()) {
        stopPlaying();
        startPlaying();
      }
    });

    $('next-month').addEventListener('click', function () {
      stopPlaying();
      step(1);
    });
    $('next-year').addEventListener('click', function () {
      stopPlaying();
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

    /* Switching tabs should not silently burn through the decade — the student
     * comes back to a finished run they never saw. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopPlaying();
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
