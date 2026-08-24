/* Bootstrap and event wiring. */

(function () {
  'use strict';

  const $ = UI.$;

  /* The single-file bundle deliberately omits live-prices.js — its whole
   * point is making zero network requests, so it always plays with static
   * starting prices, same as before this feature existed. This is what lets
   * the served app call the real LivePrices without app.js needing to know
   * or care which version of itself it is. */
  function fetchLivePrices(maxWaitMs) {
    if (typeof LivePrices === 'undefined') return Promise.resolve({});
    return LivePrices.ready(maxWaitMs);
  }

  /* One default seed per run length, because a decade that teaches the right
   * lesson is not the same decade stretched to twenty years.
   *
   * The ten-year seed used to be the default at every length, and at twenty
   * years it was a disaster: it sits at the 97th percentile of markets, every
   * one of the sixteen assets beat its own stated expected return, and Nvidia
   * returned 20.7% a year against a stated 4%. A student who picked "20 years"
   * was shown a market where the wildest thing on the board won by miles —
   * exactly the opposite of what the app is for.
   *
   * Each of these was chosen from 4,000 candidates on the same criteria: the
   * world fund lands near its stated 8%, no speculative asset beats it, bitcoin
   * loses to it, there is a fall of at least a quarter to sit through, the
   * economy passes through every phase of the cycle, and the crash decisions are
   * spread across the run rather than bunched.
   *
   *   5 years  — funds take the top two places, bitcoin loses 32% a year, and
   *              three recessions arrive in months 11, 41 and 53.
   *  10 years  — the world fund lands on 7.9%. Bitcoin loses 9.6% a year and
   *              the best single company, Fisher & Paykel at 9.2%, is barely
   *              ahead of a boring fund after carrying several times the risk.
   *  20 years  — the S&P 500 and world funds tie at the top on 8.5%, Tesla
   *              loses 10% a year, and six crashes land between months 27 and
   *              238 with all four phases of the cycle well represented. */
  const DEFAULT_SEEDS = {
    5: 'classroom-3756',
    10: 'classroom-4019',
    20: 'classroom-3094'
  };
  const DEFAULT_SEED = DEFAULT_SEEDS[10];

  function defaultSeedFor(years) {
    return DEFAULT_SEEDS[years] || DEFAULT_SEED;
  }

  function isDefaultSeed(value) {
    return Object.keys(DEFAULT_SEEDS).some(function (k) {
      return DEFAULT_SEEDS[k] === value;
    });
  }

  let state = null;
  let chart = null;
  let mode = 'solo';
  let opponent = null;

  function newGame(seed, years, goalId, liveStartPrices) {
    stopPlaying();
    cancelAnimation();
    const months = years * Market.MONTHS_PER_YEAR;
    const market = Market.generate(seed, months, liveStartPrices);

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
    AssetPanel.refresh();
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

  /* Whether a crash headline has earned the right to stop the run and demand an
   * answer. Holding anything at all used to be enough, which produced two kinds
   * of nonsense modal:
   *
   *   "Your investments $9,201 → $9,774  +6.2%"   — a panic button offered for
   *   a month in which the portfolio went up, because the headline said crash
   *   even though this particular mix of holdings shrugged it off.
   *
   *   "Your investments $135 → $132  -2.4%"       — a full-screen decision about
   *   three dollars, while $13,243 sat untouched in cash.
   *
   * Both teach the student that the modal is noise to be clicked past, which is
   * the last thing this feature can afford. So it now has to be a real fall, and
   * one that cost real money. The news banner still carries every headline
   * either way; only the interruption is rationed.
   *
   * Deliberately measured against the investments and not the whole portfolio.
   * A student sitting on mostly cash still gets asked, because "prices just fell
   * and you have money spare" is the most useful version of this question there
   * is — it is the one where Buy more is a real answer. */
  function worthStopping(before) {
    if (!(before > 0.005)) return false;
    const after = Portfolio.investedValue(state);
    if (after / before - 1 > -0.03) return false;
    return before - after >= 20;
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
        if (ev.crash && worthStopping(before)) {
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
      submitToNationalLeaderboard();
    }
    return sawBigEvent;
  }

  /* Opt-in only: does nothing unless the student is logged in and picked a
   * competition before this run started (js/leaderboard.js). A practice run
   * with no competition selected never touches the network. */
  function submitToNationalLeaderboard() {
    if (!Account.isConfigured() || !Account.isLoggedIn() || !Leaderboard.getActiveCompetition()) return;
    const code = $('share-code').textContent;
    Leaderboard.maybeSubmit(state, code).then(
      function () {
        setNotice('Submitted to the national leaderboard.');
        refreshNationalBoard();
      },
      function (err) {
        setNotice('Could not submit to the national leaderboard: ' + err.message);
      }
    );
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

    UI.showDecision(state, event, damage, function (choice, categoryId) {
      if (choice === 'sell-cat') {
        const cat = Market.categoryById(categoryId);
        const r = Portfolio.sellCategory(state, categoryId);
        setNotice(
          'Sold your ' +
            cat.name.toLowerCase() +
            ' for ' +
            UI.money(r.sold, 2) +
            ', paying ' +
            UI.money(r.fees, 2) +
            ' in fees. Everything else is untouched.'
        );
      } else if (choice === 'sell') {
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
      AssetPanel.refresh();
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

  async function restart() {
    const years = parseInt($('years-input').value, 10) || 10;
    const seed = $('seed-input').value.trim() || defaultSeedFor(years);
    // A fresh "start over" is usually seconds or minutes after the page
    // opened, so the background fetch kicked off at load time has almost
    // certainly already landed — this wait is a safety margin, not the
    // normal path.
    const live = await fetchLivePrices(3000);
    newGame(seed, years, $('goal-input').value, live);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* True when the controls describe a different run from the one being played. */
  function settingsPending() {
    if (!state) return false;
    const years = parseInt($('years-input').value, 10) || 10;
    const seed = $('seed-input').value.trim() || defaultSeedFor(years);
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
    initGate();
    restoreTheme();
    setupInstall();

    Glossary.attach(function () {
      return state;
    });

    AssetPanel.attach(function () {
      return state;
    });

    Intro.attach(function () {
      return state ? state.cfg : Portfolio.DEFAULTS;
    });
    $('help-btn').addEventListener('click', function () {
      Intro.open(0);
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
      /* Each length has its own default market. Swapping it in is only right
       * while the box still holds a default — the moment a student has typed
       * their own seed, or their teacher has handed the class one, changing the
       * length must not quietly replace it. */
      const box = $('seed-input');
      if (isDefaultSeed(box.value.trim())) {
        box.value = defaultSeedFor(parseInt(this.value, 10) || 10);
      }
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

    initNationalLeaderboard();

    const openingYears = parseInt($('years-input').value, 10) || 10;
    const openingSeed = $('seed-input').value.trim() || defaultSeedFor(openingYears);
    // Short wait on the very first load — LivePrices.start() fired as soon as
    // its script loaded, before any of this ran, so it already has a head
    // start; this is just a brief grace period for a fast response, not the
    // 3s margin a later "start over" can afford to give it.
    fetchLivePrices(1200).then(function (live) {
      newGame(openingSeed, openingYears, 'car', live);
      // Skip the opening briefing while the gate is still up - it belongs to
      // the first look at the game itself, not stacked behind a locked door.
      if (gateUnlocked()) Intro.maybeOpen();
    });
  });

  /* ---------------- shared login/signup wiring ----------------
   *
   * Both the entry gate and the "national leaderboard account" card inside
   * the app run the same login/signup flow against the same backend session
   * - they just use different id prefixes for their copies of the form
   * (`gate-*` / `account-*`) so the two can be shown/hidden independently.
   * Wiring this once and re-running it per prefix keeps the school-picker
   * logic in one place rather than two copies that could drift. */
  function wireAuthForm(prefix, onAuthed) {
    const errorEl = $(prefix + '-error');
    function formError(message) {
      errorEl.hidden = !message;
      errorEl.textContent = message || '';
    }

    $(prefix + '-signup-toggle').addEventListener('click', function () {
      const showing = !$(prefix + '-signup-fields').hidden;
      $(prefix + '-signup-fields').hidden = showing;
      $(prefix + '-signup-controls').hidden = showing;
    });

    // School picker: debounced search against the public schools endpoint,
    // fed into a <datalist> so the browser handles the actual dropdown/typeahead.
    // schoolsByName tracks the last search results so submit can resolve the
    // typed text back to an id without a second round trip.
    let schoolsByName = {};
    let schoolSearchTimer = null;
    $(prefix + '-school').addEventListener('input', function () {
      const q = this.value.trim();
      clearTimeout(schoolSearchTimer);
      if (q.length < 2) return;
      schoolSearchTimer = setTimeout(function () {
        Account.searchSchools(q).then(function (schools) {
          schoolsByName = {};
          const list = $(prefix + '-school-options');
          list.innerHTML = '';
          schools.forEach(function (school) {
            schoolsByName[school.name.toLowerCase()] = school;
            const option = document.createElement('option');
            option.value = school.name;
            list.appendChild(option);
          });
        }, function () {
          /* search failing shouldn't block typing - "isn't listed" still works */
        });
      }, 250);
    });

    $(prefix + '-school-unlisted').addEventListener('change', function () {
      $(prefix + '-school-other-field').hidden = !this.checked;
      $(prefix + '-school').disabled = this.checked;
      if (this.checked) $(prefix + '-school').value = '';
    });

    $(prefix + '-login-btn').addEventListener('click', function () {
      formError('');
      Account.login($(prefix + '-username').value.trim(), $(prefix + '-password').value).then(
        onAuthed,
        function (err) {
          formError(err.message);
        }
      );
    });

    $(prefix + '-signup-btn').addEventListener('click', function () {
      formError('');

      const unlisted = $(prefix + '-school-unlisted').checked;
      const schoolTyped = $(prefix + '-school').value.trim();
      let school_id = null;
      let school_other = null;
      if (unlisted) {
        school_other = $(prefix + '-school-other').value.trim() || null;
      } else if (schoolTyped) {
        const match = schoolsByName[schoolTyped.toLowerCase()];
        if (!match) {
          formError('Pick your school from the list, or check "My school isn\'t listed".');
          return;
        }
        school_id = match.id;
      }

      Account.signup({
        email: $(prefix + '-email').value.trim(),
        username: $(prefix + '-username').value.trim(),
        password: $(prefix + '-password').value,
        display_name: $(prefix + '-display-name').value.trim(),
        school_id: school_id,
        school_other: school_other,
        city: $(prefix + '-city').value.trim() || null,
        age_bracket: $(prefix + '-age-bracket').value
      }).then(onAuthed, function (err) {
        formError(err.message);
      });
    });
  }

  /* ---------------- entry gate ----------------
   *
   * Market Lab is free for schools, and a paid personal membership (not yet
   * open - no payment provider is wired up) covers everyone else. "Signed in
   * through a school" means the logged-in account has a school attached,
   * verified or not (school verification is a later, separate feature) - see
   * the paywall note in the project plan. `marketlab_gate_bypass` exists
   * purely so tests can get past the gate deterministically without a live
   * backend round trip.
   *
   * Absent entirely from the offline single-file bundle (see build.js) -
   * that handout has no backend to sign in against, so it must never be able
   * to lock anyone out. `$('gate-screen')` is null there, and every function
   * below no-ops in that case. */
  function gateUnlocked() {
    if (localStorage.getItem('marketlab_gate_bypass') === '1') return true;
    if (!Account.isConfigured()) return true;
    const user = Account.getUser();
    return !!(user && (user.school_id || user.school_other));
  }

  function applyGateState() {
    const gate = $('gate-screen');
    if (!gate) return;
    const unlocked = gateUnlocked();
    gate.hidden = unlocked;
    $('app-wrap').hidden = !unlocked;
    return unlocked;
  }

  /* Personal (non-school) membership entry point. No payment provider is
   * chosen yet - this is deliberately just a stub so wiring up real checkout
   * later is a one-function change rather than a new button/handler to add:
   * swap the body for a redirect to (or fetch of) a real checkout session
   * once a provider (Stripe is the likely pick) is set up. Until then it
   * just states the plan in place of a working purchase flow. */
  function startPersonalMembership() {
    const note = $('gate-personal-note');
    note.hidden = false;
    note.textContent = 'Personal memberships aren’t open yet — check back soon.';
  }

  function initGate() {
    const gate = $('gate-screen');
    if (!gate) return;

    wireAuthForm('gate', function () {
      reflectAccountState();
      applyGateState();
    });

    $('gate-personal-btn').addEventListener('click', startPersonalMembership);

    applyGateState();
  }

  /* ---------------- national leaderboard (account-gated, opt-in) ---------------- */

  function initNationalLeaderboard() {
    if (!Account.isConfigured()) return; // no backend deployed yet - stays hidden
    $('national-account-card').hidden = false;
    $('national-board-card').hidden = false;

    reflectAccountState();

    $('account-toggle').addEventListener('click', function () {
      const body = $('account-body');
      const showing = !body.hidden;
      body.hidden = showing;
      this.textContent = showing ? 'Show' : 'Hide';
      this.setAttribute('aria-expanded', String(!showing));
    });

    wireAuthForm('account', reflectAccountState);

    $('account-logout-btn').addEventListener('click', function () {
      Account.logout();
      reflectAccountState();
      applyGateState();
    });

    $('national-board-toggle').addEventListener('click', function () {
      const body = $('national-board-body');
      const showing = !body.hidden;
      body.hidden = showing;
      this.textContent = showing ? 'Show' : 'Hide';
      this.setAttribute('aria-expanded', String(!showing));
      if (!showing) loadCompetitions();
    });

    $('competition-select').addEventListener('change', function () {
      const id = this.value ? parseInt(this.value, 10) : null;
      Leaderboard.setActiveCompetition(id);
      refreshNationalBoard();
    });

    $('scope-select').addEventListener('change', refreshNationalBoard);
    $('national-board-refresh').addEventListener('click', refreshNationalBoard);
  }

  function reflectAccountState() {
    const loggedIn = Account.isLoggedIn();
    $('account-signed-out').hidden = loggedIn;
    $('account-signed-in').hidden = !loggedIn;
    if (loggedIn) {
      $('account-name').textContent = Account.getUser().display_name;
    }
  }

  function loadCompetitions() {
    Leaderboard.listCompetitions().then(function (competitions) {
      const select = $('competition-select');
      select.innerHTML = competitions
        .map(function (c) {
          return '<option value="' + c.id + '">' + c.name.replace(/</g, '&lt;') + ' (' + c.status + ')</option>';
        })
        .join('');
      if (competitions.length) {
        Leaderboard.setActiveCompetition(parseInt(select.value, 10));
      }
      refreshNationalBoard();
    }, function (err) {
      $('national-board-out').innerHTML = '<p class="board-warn soft">Could not load competitions: ' + err.message + '</p>';
    });
  }

  function refreshNationalBoard() {
    const competitionId = Leaderboard.getActiveCompetition();
    if (!competitionId) return;
    const scope = $('scope-select').value;
    const filters = {};
    if (scope === 'school' && Account.getUser()) filters.school_id = Account.getUser().school_id;
    if (scope === 'city' && Account.getUser()) filters.city = Account.getUser().city;
    if (scope === 'age_bracket' && Account.getUser()) filters.age_bracket = Account.getUser().age_bracket;

    Leaderboard.fetchLeaderboard(competitionId, scope, filters).then(
      function (board) {
        $('national-board-out').innerHTML = Leaderboard.renderRows(board);
      },
      function (err) {
        $('national-board-out').innerHTML = '<p class="board-warn soft">Could not load leaderboard: ' + err.message + '</p>';
      }
    );
  }
})();
