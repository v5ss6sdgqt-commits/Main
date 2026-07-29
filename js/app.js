/* Bootstrap and event wiring. */

(function () {
  'use strict';

  const $ = UI.$;

  /* Re-picked after the business cycle and the volatility recalibration changed
   * every price path. Chosen from 8,000 candidates for being representative
   * rather than flattering: the world fund lands on its 8% expectation (7.9%),
   * there is a -32% fall to sit through, twelve months of recession, and three
   * crashes that each ask the student what to do.
   *
   * What makes this decade worth teaching is the ending. Bitcoin *loses* 9.6% a
   * year. The NZX 50 fund returns 8.6%. And the best single company on the board
   * is Fisher & Paykel at 9.3% — barely ahead of a boring world fund, after
   * carrying several times the risk to get there. Nobody is rewarded for
   * excitement, which is the entire point of the app. */
  const DEFAULT_SEED = 'classroom-4019';

  let state = null;
  let chart = null;
  let mode = 'solo';
  let opponent = null;

  function newGame(seed, years, goalId) {
    stopPlaying();
    cancelAnimation();
    const months = years * Market.MONTHS_PER_YEAR;
    const market = Market.generate(seed, months);

    const chosen = Goals.byId(goalId || 'car');
    const target = Goals.targetFor(chosen.id, Portfolio.DEFAULTS, months);
    state = Portfolio.create(market, {
      goal: target ? { id: chosen.id, name: chosen.name, target: target, blurb: chosen.blurb } : null
    });

    // Same market object, so the opponent races on the identical price path.
    opponent = mode === 'comp' ? Opponents.create($('difficulty-input').value, market) : null;

    UI.buildMarketRows(state, { onTrade: onTrade });
    UI.renderBanner(state, null);
    setNotice('');
    // Any modal belongs to the run that just ended.
    $('decision-modal').hidden = true;
    renderAll();
    reflectPlayState();
    reflectPendingSettings();
  }

  function renderAll() {
    UI.renderHeader(state);
    UI.renderHero(state);
    UI.renderGoal(state);
    UI.renderEconomy(state);
    UI.renderTiles(state);
    UI.renderAllocation(state);
    UI.updateMarket(state);
    UI.renderFeed(state);
    UI.renderOpponent(state, opponent);
    UI.renderChartTable(state);
    UI.renderResults(state, opponent);
    drawChart();
  }

  function drawChart() {
    const cfg = {
      series: UI.chartSeries(state, opponent),
      reveal: chartReveal,
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

  /* ---------------- chart animation ---------------- */

  /* The newest month is drawn growing across its segment rather than appearing
   * whole, which also slides the y-axis at the same rate and removes the jolt
   * that used to come from rescaling in a single frame.
   *
   * Only the chart redraws per frame — running the full DOM render at 60fps
   * would be wasteful and would fight the input the student is typing. */
  let chartReveal = 1;
  let revealFrame = null;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateNewMonth(duration) {
    if (revealFrame) cancelAnimationFrame(revealFrame);
    if (reducedMotion() || duration <= 0) {
      chartReveal = 1;
      drawChart();
      return;
    }

    const start = performance.now();
    chartReveal = 0;
    // Linear: the point is a steady flow, and easing would make it pulse.
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      chartReveal = p;
      drawChart();
      if (p < 1) {
        revealFrame = requestAnimationFrame(frame);
      } else {
        revealFrame = null;
        chartReveal = 1;
      }
    }
    revealFrame = requestAnimationFrame(frame);
  }

  function cancelAnimation() {
    if (revealFrame) cancelAnimationFrame(revealFrame);
    revealFrame = null;
    chartReveal = 1;
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
    let crash = null;
    let valueBeforeCrash = 0;

    for (let i = 0; i < count; i++) {
      if (state.finished) break;
      // Captured before advancing, so the modal can show the actual damage.
      const before = Portfolio.investedValue(state);
      const ev = Portfolio.advance(state);
      // Lockstep, including when a crash breaks the loop early below.
      Opponents.advance(opponent);
      if (ev) {
        lastEvent = ev;
        if (ev.big) sawBigEvent = true;
        // Only the last crash in a batch gets asked about; three modals in a row
        // for a skipped year would be punishment rather than teaching.
        if (ev.crash && before > 0.005) {
          crash = ev;
          valueBeforeCrash = before;
          /* Stop here rather than finishing the batch. A crash should interrupt
           * a skipped year, not be discovered nine months after the fact — and
           * it keeps state.month on the crash, so the modal and the end-of-run
           * analysis both report the month it actually happened. */
          break;
        }
      }
    }

    /* Only a single-month advance animates. Skipping a year adds twelve points
     * at once, where growing just the last segment would be a lie about what
     * happened.
     *
     * Decided *before* the render: cancelling afterwards would reset the reveal
     * without redrawing, leaving the previous animation's half-drawn segment on
     * screen until something unrelated triggered a repaint. */
    const willAnimate = count === 1 && !state.finished;
    if (!willAnimate) cancelAnimation();

    UI.renderBanner(state, lastEvent);
    setNotice('');
    renderAll();

    if (willAnimate) {
      // Slightly under the tick so each month settles before the next begins.
      animateNewMonth(isPlaying() ? Math.min(320, currentSpeed() * 0.8) : 260);
    }

    if (crash && !state.finished) {
      askDecision(crash, valueBeforeCrash);
      return true;
    }

    if (state.finished) {
      stopPlaying();
      $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return sawBigEvent;
  }

  /* ---------------- the crash decision ---------------- */

  /* Freezes the run and makes the student commit. This is the one decision in
   * investing that actually separates outcomes, and letting it scroll past in an
   * auto-playing chart teaches nothing at all. */
  function askDecision(event, before) {
    // Resumed after the choice, so one press of play still carries the run.
    const wasPlaying = isPlaying();
    stopPlaying();
    const after = Portfolio.investedValue(state);
    const damage = {
      before: before,
      after: after,
      change: before > 0 ? after / before - 1 : 0
    };

    UI.showDecision(state, event, damage, function (choice) {
      if (choice === 'sell') {
        const r = Portfolio.sellAll(state);
        setNotice(
          'Sold everything for ' + UI.money(r.sold, 2) + ', paying ' + UI.money(r.fees, 2) + ' in fees to get out.'
        );
      } else if (choice === 'buy') {
        const r = Portfolio.investAllCash(state);
        setNotice(
          r.invested > 0
            ? 'Put ' +
                UI.money(r.invested, 2) +
                ' of cash to work at the lower prices, paying ' +
                UI.money(r.fees, 2) +
                ' in fees.'
            : 'You had no spare cash to invest.'
        );
      } else {
        setNotice('You held on. Nothing was bought or sold.');
      }

      Portfolio.recordDecision(state, event, choice, before, Portfolio.totalValue(state));
      renderAll();
      if (wasPlaying && !state.finished) startPlaying();
    });
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

  /* Only a crash interrupts the run, and it does so by opening the decision
   * modal from inside `step`. Recoveries and ordinary headlines used to stop
   * playback too, which meant five presses of play to get through one ten-year
   * run — the opposite of a button you press once and watch. The news banner
   * carries those without halting anything. */
  function tick() {
    if (state.finished) {
      stopPlaying();
      return;
    }
    step(1);
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
    newGame(seed, years, $('goal-input').value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* True when the controls describe a different run from the one being played. */
  function settingsPending() {
    if (!state) return false;
    const seed = $('seed-input').value.trim() || DEFAULT_SEED;
    const years = parseInt($('years-input').value, 10) || 10;
    const goalId = $('goal-input').value;
    const activeGoal = state.goal ? state.goal.id : 'none';
    return (
      seed !== state.market.seed ||
      years !== state.market.months / Market.MONTHS_PER_YEAR ||
      goalId !== activeGoal
    );
  }

  function reflectPendingSettings() {
    const hint = $('setup-hint');
    const pending = settingsPending();
    hint.hidden = !pending;
    $('restart-btn').classList.toggle('pending', pending);
  }

  /* Targets depend on run length, so the option labels are rebuilt whenever the
   * number of years changes — otherwise the menu would advertise a $10,500 car
   * on a five-year run that can only ever reach $6,000. */
  function fillGoalOptions() {
    const select = $('goal-input');
    const years = parseInt($('years-input').value, 10) || 10;
    const months = years * Market.MONTHS_PER_YEAR;
    const current = select.value || 'car';

    select.innerHTML = Goals.GOALS.map(function (g) {
      const target = Goals.targetFor(g.id, Portfolio.DEFAULTS, months);
      return (
        '<option value="' +
        g.id +
        '">' +
        g.name +
        (target ? ' — ' + UI.money(target) : '') +
        '</option>'
      );
    }).join('');
    select.value = current;
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

    /* Neither dropdown takes effect on its own. Goal used to restart instantly,
     * which threw away an eight-year run for anyone who opened it out of
     * curiosity; years used to do nothing, leaving the menu advertising a target
     * the live run was not playing. Both now just flag that a restart is needed. */
    /* Mode is a tab, not a setting: switching starts a fresh run, because
     * joining a race halfway through would not be a race. Said out loud rather
     * than done silently. */
    $('difficulty-input').innerHTML = Opponents.LEVELS.map(function (l) {
      return '<option value="' + l.id + '">' + l.difficulty + ' — ' + l.name + '</option>';
    }).join('');
    $('difficulty-input').value = 'easy';

    function setMode(next) {
      if (mode === next) return;
      mode = next;
      $('mode-solo').classList.toggle('is-on', mode === 'solo');
      $('mode-comp').classList.toggle('is-on', mode === 'comp');
      $('mode-solo').setAttribute('aria-selected', String(mode === 'solo'));
      $('mode-comp').setAttribute('aria-selected', String(mode === 'comp'));
      restart();
      setNotice(
        mode === 'comp'
          ? 'New run started. You are racing ' + Opponents.byId($('difficulty-input').value).name + ' on the same prices.'
          : 'New run started in solo mode.'
      );
    }

    $('mode-solo').addEventListener('click', function () {
      setMode('solo');
    });
    $('mode-comp').addEventListener('click', function () {
      setMode('comp');
    });
    $('difficulty-input').addEventListener('change', function () {
      if (mode !== 'comp') return;
      restart();
      setNotice('New run started against ' + Opponents.byId(this.value).name + '.');
    });

    fillGoalOptions();
    $('years-input').addEventListener('change', function () {
      fillGoalOptions();
      reflectPendingSettings();
    });
    $('goal-input').addEventListener('change', reflectPendingSettings);
    $('seed-input').addEventListener('input', reflectPendingSettings);

    $('again-btn').addEventListener('click', function () {
      $('seed-input').value = randomSeed();
      restart();
    });

    $('copy-code').addEventListener('click', function () {
      const code = $('share-code').textContent;
      const done = function () {
        const btn = $('copy-code');
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.textContent = 'Copy';
        }, 1400);
      };
      // Clipboard access is refused on file:// in some browsers, so fall back to
      // selecting the text rather than leaving the button doing nothing.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, selectCode);
      } else {
        selectCode();
      }
    });

    function selectCode() {
      const el = $('share-code');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      $('copy-code').textContent = 'Selected — press Ctrl+C';
    }

    $('board-toggle').addEventListener('click', function () {
      const body = $('board-body');
      const showing = !body.hidden;
      body.hidden = showing;
      this.textContent = showing ? 'Show' : 'Hide';
      this.setAttribute('aria-expanded', String(!showing));
      if (!showing) UI.renderLeaderboard($('board-input').value);
    });

    $('board-rank').addEventListener('click', function () {
      UI.renderLeaderboard($('board-input').value);
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

    newGame($('seed-input').value.trim() || DEFAULT_SEED, 10, 'car');
  });
})();
