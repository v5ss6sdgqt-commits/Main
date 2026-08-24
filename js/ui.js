/* DOM rendering.
 *
 * The market table's rows are built once and then updated in place rather than
 * re-created each month — rebuilding would wipe whatever amount the student had
 * typed into a trade box mid-decision.
 *
 * With sixteen assets the table is grouped by category, and the allocation
 * summary aggregates by category too: sixteen distinguishable colours is beyond
 * what anyone can actually read, and five is comfortable. */

(function (global) {
  'use strict';

  const $ = function (id) {
    return document.getElementById(id);
  };

  function money(n, dp) {
    const d = typeof dp === 'number' ? dp : 0;
    const sign = n < 0 ? '-' : '';
    return (
      sign +
      '$' +
      Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    );
  }

  /* Prices span $0.62 (Air NZ) to $178,000 (bitcoin), so a fixed number of
   * decimals is wrong at one end or the other. */
  function price(n) {
    if (n >= 10000) return money(n, 0);
    if (n >= 100) return money(n, 2);
    return money(n, 2);
  }

  function signedMoney(n, dp) {
    return (n >= 0 ? '+' : '') + money(n, dp);
  }

  function pct(n, dp) {
    const d = typeof dp === 'number' ? dp : 1;
    return (n >= 0 ? '+' : '') + (n * 100).toFixed(d) + '%';
  }

  function plainPct(n, dp) {
    const d = typeof dp === 'number' ? dp : 1;
    return (n * 100).toFixed(d) + '%';
  }

  // Canvas cannot read `var(--x)`, so series colors are resolved at draw time.
  function resolveColor(value) {
    const match = /^var\((--[\w-]+)\)$/.exec(String(value).trim());
    if (!match) return value;
    return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  }

  function monthLabel(m) {
    if (m === 0) return 'Start';
    const year = Math.floor((m - 1) / 12) + 1;
    return 'Month ' + m + ' · year ' + year;
  }

  function shortMonth(m) {
    return m === 0 ? 'Start' : 'M' + m;
  }

  const RISK_WORDS = ['', 'Very low', 'Low', 'Medium', 'High', 'Extreme'];

  /* ---------------- header, hero, tiles ---------------- */

  function renderHeader(state) {
    const m = state.month;
    const year = Math.floor(m / 12);
    const mo = m % 12;
    $('clock-text').textContent =
      m === 0 ? 'Start · Year 0' : 'Year ' + year + ' · month ' + mo + ' of 12';

    const left = state.market.months - m;
    $('months-left').textContent = left === 0 ? 'Finished' : left + ' months to go';
    $('next-month').disabled = state.finished;
    $('next-year').disabled = state.finished;
    $('play-btn').disabled = state.finished;
  }

  function renderHero(state) {
    const total = Portfolio.totalValue(state);
    const contributed = state.totalContributed;
    const profit = total - contributed;

    $('hero-value').textContent = money(total);
    const delta = $('hero-delta');
    delta.textContent =
      signedMoney(profit) + ' (' + pct(contributed > 0 ? profit / contributed : 0) + ') on money you put in';
    delta.className = 'hero-delta ' + (profit >= 0 ? 'up' : 'down');
  }

  function renderTiles(state) {
    const total = Portfolio.totalValue(state);
    $('tile-cash').textContent = money(state.cash);
    $('tile-cash-note').textContent = 'Earns ' + plainPct(state.cfg.savingsRate) + ' a year';
    $('tile-contributed').textContent = money(state.totalContributed);
    $('tile-contributed-note').textContent = money(state.cfg.monthlyContribution) + ' added monthly';
    $('tile-real').textContent = money(Portfolio.realValue(state, total));
    $('tile-inflation').textContent =
      'Prices up ' + plainPct(state.market.cpi[state.month] - 1) + ' since the start';
    $('tile-fees').textContent = money(state.totalFees, 2);
    $('tile-trades').textContent = state.tradeCount === 1 ? '1 trade' : state.tradeCount + ' trades';
  }

  /* ---------------- goal ---------------- */

  function renderGoal(state) {
    const box = $('goal-box');
    const p = Goals.progress(state);
    if (!p) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    $('goal-name').textContent = state.goal.name + ' — ' + money(p.target);
    $('goal-count').textContent = money(p.current) + ' of ' + money(p.target);
    $('goal-fill').style.width = p.fraction * 100 + '%';
    box.classList.toggle('reached', p.reached);

    const note = $('goal-note');
    if (p.reached) {
      note.textContent = 'You have made it. Anything from here is extra.';
      return;
    }
    if (state.finished) {
      note.textContent = money(p.shortfall) + ' short.';
      return;
    }

    const need = p.required;
    if (need === Infinity) {
      note.textContent = 'Out of reach now — nothing on this board grows that fast.';
    } else if (need === -Infinity || need === null) {
      note.textContent = money(p.shortfall) + ' to go.';
    } else if (need <= 0) {
      note.textContent = 'On track even if nothing grows from here.';
    } else {
      note.textContent =
        'Needs about ' + plainPct(need) + ' a year from here' + (need > 0.14 ? ' — that is a lot.' : '.');
    }
  }

  /* ---------------- the economy ---------------- */

  function renderEconomy(state) {
    const phase = Market.cycleById(state.market.cycle[state.month]);
    const growth = state.market.gdp[state.month];

    $('econ-phase').textContent = phase.name;
    $('econ-phase').className = 'econ-phase mood-' + phase.mood;
    $('econ-blurb').textContent = phase.blurb;
    $('econ-teach').textContent = phase.teach;

    const g = $('econ-gdp');
    g.textContent = pct(growth);
    g.className = 'econ-gdp-v ' + (growth >= 0 ? 'up' : 'down');

    /* The loop, drawn as a loop. Students are taught these four stages by name,
     * so showing where the run currently sits connects the app to the lesson. */
    $('econ-track').innerHTML = Market.CYCLE.map(function (c) {
      return (
        '<li class="econ-step' +
        (c.id === phase.id ? ' is-on mood-' + c.mood : '') +
        '"><span></span>' +
        c.name +
        '</li>'
      );
    }).join('');

    // GDP so far, so a recession is visible as a dip rather than only a word.
    const series = state.market.gdp.slice(0, state.month + 1);
    Charts.sparkline(
      $('econ-spark'),
      series.length > 1 ? series : [growth, growth],
      resolveColor(growth >= 0 ? 'var(--up)' : 'var(--down)'),
      { zero: 0 }
    );
  }

  /* ---------------- class leaderboard ---------------- */

  function renderLeaderboard(text) {
    const out = $('board-out');
    const board = Share.leaderboard(text);

    if (!board.rows.length && !board.rejected.length) {
      out.innerHTML = '<p class="board-help">Nothing pasted yet.</p>';
      return;
    }

    let html = '';

    /* Comparing results from different markets is comparing luck, so say so
     * rather than quietly producing a ranking that means nothing. */
    if (board.mixedMarkets) {
      html +=
        '<div class="board-warn">These codes are not all from the same market seed, so this ranking compares luck rather than decisions. Have everyone re-run with the same seed.</div>';
    } else if (board.mixedLengths) {
      html +=
        '<div class="board-warn">These runs are different lengths, so the totals are not directly comparable.</div>';
    }

    if (board.rows.length) {
      html +=
        '<div class="data-table"><table><thead><tr><th scope="col">#</th><th scope="col">Name</th>' +
        '<th scope="col">Final value</th><th scope="col">Trades</th><th scope="col">Played</th></tr></thead><tbody>' +
        board.rows
          .map(function (r) {
            return (
              '<tr><td>' +
              r.rank +
              '</td><td>' +
              r.name.replace(/</g, '&lt;') +
              '</td><td><strong>' +
              money(r.value) +
              '</strong></td><td>' +
              r.trades +
              '</td><td>' +
              (r.opponent ? 'vs ' + r.opponent.name : 'solo') +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>';
    }

    if (board.rejected.length) {
      html +=
        '<div class="board-warn soft">Could not read ' +
        board.rejected.length +
        (board.rejected.length === 1 ? ' line' : ' lines') +
        ': ' +
        board.rejected
          .map(function (r) {
            return '&ldquo;' + r.name.replace(/</g, '&lt;') + '&rdquo; (' + r.reason + ')';
          })
          .join(', ') +
        '</div>';
    }

    out.innerHTML = html;
  }

  /* ---------------- the opponent ---------------- */

  function renderOpponent(state, opp) {
    const card = $('opponent-card');
    if (!opp) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const you = Portfolio.totalValue(state);
    const them = Opponents.value(opp);
    const lead = you - them;

    $('opp-name').textContent = opp.level.name;
    $('opp-tagline').textContent = opp.level.tagline;
    $('opp-value').textContent = money(them);

    /* A two-sided bar rather than two numbers: who is ahead should be readable
     * without doing arithmetic, which is the whole point of a race. */
    const total = you + them;
    const yourShare = total > 0 ? (you / total) * 100 : 50;
    $('opp-race').innerHTML =
      '<div class="race-bar"><div class="race-you" style="width:' +
      yourShare +
      '%"></div><div class="race-them" style="width:' +
      (100 - yourShare) +
      '%"></div></div>' +
      '<div class="race-legend"><span class="you">You ' +
      money(you) +
      '</span><span class="' +
      (lead >= 0 ? 'ahead' : 'behind') +
      '">' +
      (lead >= 0 ? money(lead) + ' ahead' : money(-lead) + ' behind') +
      '</span></div>';

    const moves = $('opp-moves');
    if (!opp.moves.length) {
      moves.innerHTML =
        '<li class="empty">' +
        (state.month === 0 ? 'Waiting for the market to open.' : 'Has not traded yet.') +
        '</li>';
      return;
    }
    moves.innerHTML = opp.moves
      .slice(0, 6)
      .map(function (m) {
        return '<li><span class="when">M' + m.month + '</span><span class="what">' + m.text + '</span></li>';
      })
      .join('');
  }

  /* ---------------- the crash decision ---------------- */

  function showDecision(state, event, damage, onChoose) {
    const modal = $('decision-modal');
    $('d-when').textContent = 'Year ' + Math.floor(state.month / 12) + ' · month ' + (state.month % 12);
    $('d-headline').textContent = event.headline;
    $('d-why').textContent = event.why;

    /* Labelled as investments, not total, because cash did not move — claiming
     * the whole portfolio fell would be the kind of small lie that makes a
     * student stop trusting the rest of the numbers. */
    $('d-money').innerHTML =
      '<span class="d-money-label">Your investments</span><span class="d-before">' +
      money(damage.before) +
      '</span><span class="d-arrow">&rarr;</span><span class="d-after">' +
      money(damage.after) +
      '</span><span class="d-drop">' +
      pct(damage.change) +
      '</span>';

    /* Each option states what it would actually do to this portfolio. Generic
     * labels made "Buy more" a dead end for anyone with no cash — it printed an
     * apology after the fact instead of saying so up front. */
    const held = Market.ASSETS.filter(function (a) {
      return Portfolio.holdingValue(state, a.id) > 0.005;
    }).length;
    const sellFees = held * state.cfg.feeFlat + damage.after * state.cfg.feeRate;
    const spare = Math.max(0, Portfolio.maxBuy(state));
    const buyFee = spare > 0 ? Portfolio.feeOn(state, spare) : 0;

    /* Offering to invest a trivial amount is a trap, not a choice: with $4 of
     * cash the honest maths is "put $1 in and pay $3 for the privilege", a 75%
     * instant loss the button would be inviting them into. Anything where the
     * fee would eat more than a tenth of the trade is refused outright and says
     * why — which is the fee lesson stated up front rather than after the fact. */
    const worthIt = spare > 0 && buyFee / spare <= 0.1;

    const sellBtn = modal.querySelector('.d-choice.sell');
    const buyBtn = modal.querySelector('.d-choice.buy');
    sellBtn.querySelector('small').textContent =
      'Cash out ' + (held === 1 ? 'your holding' : 'all ' + held + ' holdings') + ' · about ' + money(sellFees, 2) + ' in fees';
    buyBtn.querySelector('small').textContent = worthIt
      ? 'Put your ' + money(spare) + ' cash in at lower prices'
      : spare > 0
        ? 'Only ' + money(spare) + ' spare — the ' + money(buyFee, 2) + ' fee would eat it'
        : 'You have no spare cash';
    buyBtn.disabled = !worthIt;

    /* The targeted sell. "Sell everything" is the wrong instrument for a crypto
     * collapse — it dumps the bonds and the world fund too, which the headline
     * had nothing to do with. This offers the surgical version, but only when it
     * is genuinely a different choice: the student has to hold something in the
     * hit category *and* something outside it, or the button would either do
     * nothing or duplicate "sell everything". */
    const catBtn = modal.querySelector('.d-choice.sell-cat');
    const worst = Market.worstCategory(event);
    let catValue = 0;
    let catCount = 0;
    if (worst) {
      Market.assetsInCategory(worst.category.id).forEach(function (a) {
        const v = Portfolio.holdingValue(state, a.id);
        if (v > 0.005) {
          catValue += v;
          catCount += 1;
        }
      });
    }
    const offerTargeted = !!worst && catValue > 0.005 && damage.after - catValue > 0.005;

    catBtn.hidden = !offerTargeted;
    if (offerTargeted) {
      const catFees = catCount * state.cfg.feeFlat + catValue * state.cfg.feeRate;
      catBtn.querySelector('strong').textContent = 'Sell just the ' + worst.category.name.toLowerCase();
      catBtn.querySelector('small').textContent =
        'Cash out ' + money(catValue) + ', keep the rest · about ' + money(catFees, 2) + ' in fees';
      catBtn.setAttribute('data-category', worst.category.id);
    }

    modal.hidden = false;

    const buttons = Array.prototype.slice.call(modal.querySelectorAll('.d-choice'));

    /* A real trap. The dialog claims aria-modal and blocks pointer events, but
     * Tab used to walk straight out to the page behind — where the keyboard
     * could reach Start over and build a new run while this modal still held
     * listeners bound to the old one. */
    function trap(ev) {
      if (ev.key !== 'Tab') return;
      const live = buttons.filter(function (b) {
        return !b.disabled && !b.hidden;
      });
      const first = live[0];
      const last = live[live.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      } else if (live.indexOf(document.activeElement) === -1) {
        ev.preventDefault();
        first.focus();
      }
    }

    function handle(ev) {
      const choice = ev.currentTarget.getAttribute('data-choice');
      const category = ev.currentTarget.getAttribute('data-category');
      buttons.forEach(function (b) {
        b.removeEventListener('click', handle);
      });
      document.removeEventListener('keydown', trap, true);
      modal.hidden = true;
      onChoose(choice, category);
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', handle);
    });
    document.addEventListener('keydown', trap, true);
    // "Do nothing" holds focus: the middle option, and the one that acts least.
    modal.querySelector('.d-choice.hold').focus();
  }

  /* ---------------- main chart ---------------- */

  /* In comp mode the opponent replaces the benchmark on the chart. Three lines
   * is one too many to read at a glance, and the benchmark still appears in the
   * results — where it is a fact to absorb rather than something to watch. */
  function chartSeries(state, opp) {
    const you = {
      key: 'portfolio',
      name: 'Your portfolio',
      color: resolveColor('var(--series-portfolio)'),
      fill: resolveColor('var(--series-portfolio-fill)'),
      values: state.history.map(function (h) {
        return h.total;
      })
    };

    if (opp) {
      return [
        you,
        {
          key: 'opponent',
          name: opp.level.name,
          color: resolveColor('var(--series-opponent)'),
          fill: resolveColor('var(--series-opponent)'),
          values: opp.state.history.map(function (h) {
            return h.total;
          })
        }
      ];
    }

    return [
      you,
      {
        key: 'benchmark',
        name: 'World fund, bought and held',
        color: resolveColor('var(--series-world)'),
        values: state.history.map(function (h) {
          return h.benchmark;
        })
      }
    ];
  }

  function renderChartTable(state) {
    const body = $('chart-table-body');
    const rows = state.history
      .slice()
      .reverse()
      .map(function (h) {
        const diff = h.total - h.benchmark;
        return (
          '<tr><td>' +
          monthLabel(h.month) +
          '</td><td>' +
          money(h.total) +
          '</td><td>' +
          money(h.benchmark) +
          '</td><td class="' +
          (diff >= 0 ? 'up' : 'down') +
          '">' +
          signedMoney(diff) +
          '</td></tr>'
        );
      });
    body.innerHTML = rows.join('');
  }

  function showTooltip(state, idx) {
    const tip = $('chart-tooltip');
    if (idx === null || !state.history[idx]) {
      tip.classList.remove('on');
      return;
    }
    const h = state.history[idx];
    const diff = h.total - h.benchmark;
    tip.innerHTML =
      '<div class="t-head">' +
      monthLabel(h.month) +
      '</div>' +
      '<div class="t-row"><span class="key dot" style="background:var(--series-portfolio)"></span>Your portfolio<span class="v">' +
      money(h.total) +
      '</span></div>' +
      '<div class="t-row"><span class="key dot" style="background:var(--series-world)"></span>Doing nothing<span class="v">' +
      money(h.benchmark) +
      '</span></div>' +
      '<div class="t-row" style="margin-top:4px">Difference<span class="v ' +
      (diff >= 0 ? 'up' : 'down') +
      '">' +
      signedMoney(diff) +
      '</span></div>';

    const box = $('main-chart').getBoundingClientRect();
    const padL = 58;
    const padR = 96;
    const plotW = box.width - padL - padR;
    const n = state.history.length;
    const px = padL + (plotW * idx) / Math.max(1, n - 1);
    const tipW = 186;
    let left = px + 14;
    if (left + tipW > box.width) left = px - tipW - 14;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = '14px';
    tip.classList.add('on');
  }

  /* ---------------- allocation ---------------- */

  /* Aggregated by category rather than by asset: a student holding eight things
   * wants to know "how much of me is crypto", not to decode eight shades. */
  function allocationParts(state) {
    const parts = [];
    Market.CATEGORIES.forEach(function (cat) {
      let value = 0;
      Market.assetsInCategory(cat.id).forEach(function (a) {
        value += Portfolio.holdingValue(state, a.id);
      });
      if (value > 0.005) parts.push({ id: cat.id, name: cat.name, color: cat.color, value: value });
    });
    if (state.cash > 0.005) {
      parts.push({ id: 'cash', name: 'Cash', color: 'var(--series-cash)', value: state.cash });
    }
    return parts;
  }

  function renderAllocation(state) {
    const wrap = $('alloc-wrap');
    const legend = $('alloc-legend');
    const parts = allocationParts(state);
    const total = parts.reduce(function (s, p) {
      return s + p.value;
    }, 0);

    if (!total) {
      wrap.innerHTML = '<div class="alloc-empty">Nothing to show yet.</div>';
      legend.innerHTML = '';
      return;
    }

    wrap.innerHTML =
      '<div class="alloc-bar">' +
      parts
        .map(function (p) {
          return (
            '<div class="alloc-seg" style="width:' +
            (p.value / total) * 100 +
            '%;background:' +
            p.color +
            '" title="' +
            p.name +
            ' — ' +
            money(p.value) +
            '"></div>'
          );
        })
        .join('') +
      '</div>';

    // Legend carries identity in text, so the segments never rely on color alone.
    legend.innerHTML = parts
      .map(function (p) {
        return (
          '<span class="item"><span class="key dot" style="background:' +
          p.color +
          '"></span>' +
          p.name +
          ' <strong style="font-variant-numeric:tabular-nums">' +
          plainPct(p.value / total, 0) +
          '</strong></span>'
        );
      })
      .join('');
  }

  /* ---------------- market table ---------------- */

  const marketRows = {};

  // Shown when no search/filter is active - the original 16, unmarked by
  // the expanded universe's `generatedColor` flag (see js/market.js). A
  // student who hasn't asked to see the other ~75 assets doesn't get them
  // dumped on screen; searching or picking a filter reveals the full list.
  function isStarterAsset(a) {
    return !a.generatedColor;
  }

  function buildMarketRows(state, handlers, matchFn) {
    const match = matchFn || isStarterAsset;
    const body = $('market-body');
    body.innerHTML = '';
    Object.keys(marketRows).forEach(function (k) {
      delete marketRows[k];
    });

    Market.CATEGORIES.forEach(function (cat) {
      const assets = Market.assetsInCategory(cat.id).filter(match);
      if (!assets.length) return;

      const head = document.createElement('tr');
      head.className = 'cat-row';
      head.innerHTML =
        '<td colspan="8"><span class="cat-chip" style="background:' +
        cat.color +
        '"></span><span class="cat-name">' +
        cat.name +
        '</span><span class="cat-blurb">' +
        cat.blurb +
        '</span></td>';
      body.appendChild(head);

      assets.forEach(function (a) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td><div class="asset-cell"><span class="key dot" style="background:' +
          a.color +
          '"></span><span><span class="asset-name">' +
          a.name +
          '</span><br><span class="asset-kind">' +
          a.ticker +
          ' · ' +
          a.where +
          '</span></span></div></td>' +
          '<td data-label="Risk"><span class="risk risk-' +
          a.risk +
          '">' +
          RISK_WORDS[a.risk] +
          '</span></td>' +
          '<td class="c-price" data-label="Price"></td>' +
          '<td class="c-change" data-label="1 month"></td>' +
          /* The two return figures sit side by side deliberately — the gap
             between them is the lesson, and it only works if you see both. */
          '<td class="c-returns" data-label="Past / expected">' +
          '<button type="button" class="ret-pair" data-term="past-performance" aria-label="Past and expected return for ' +
          a.name +
          ' — what does this mean?">' +
          '<span class="ret-past">' +
          plainPct(a.past.ret, 0) +
          '</span><span class="ret-sep">→</span><span class="ret-exp">' +
          plainPct(a.mu, 1) +
          '</span></button>' +
          '<span class="ret-note">' +
          a.past.since +
          '</span></td>' +
          '<td class="col-history"><button type="button" class="spark-btn" data-asset="' +
          a.id +
          '" aria-label="Show the price history and details for ' +
          a.name +
          '"><canvas class="spark"></canvas></button></td>' +
          '<td class="c-holding" data-label="You hold"></td>' +
          '<td data-label="Trade"><div class="trade-cell">' +
          '<input type="number" min="0" step="10" placeholder="$" aria-label="Amount in dollars to trade in ' +
          a.name +
          '">' +
          '<button class="mini buy" type="button">Buy</button>' +
          '<button class="mini sell" type="button">Sell</button>' +
          '</div></td>';
        body.appendChild(tr);

        const input = tr.querySelector('input');
        const buyBtn = tr.querySelector('.buy');
        const sellBtn = tr.querySelector('.sell');

        buyBtn.addEventListener('click', function () {
          handlers.onTrade('buy', a.id, parseFloat(input.value));
        });
        sellBtn.addEventListener('click', function () {
          handlers.onTrade('sell', a.id, parseFloat(input.value));
        });
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') handlers.onTrade('buy', a.id, parseFloat(input.value));
        });

        marketRows[a.id] = {
          tr: tr,
          price: tr.querySelector('.c-price'),
          change: tr.querySelector('.c-change'),
          holding: tr.querySelector('.c-holding'),
          spark: tr.querySelector('.spark'),
          input: input,
          buy: buyBtn,
          sell: sellBtn
        };
      });
    });
  }

  function updateMarket(state) {
    const m = state.month;
    Market.ASSETS.forEach(function (a) {
      const row = marketRows[a.id];
      if (!row) return;

      const p = Portfolio.priceOf(state, a.id);
      const change = state.market.returns[a.id][m];
      row.price.textContent = price(p);
      row.change.textContent = m === 0 ? '—' : pct(change);
      row.change.className = 'c-change ' + (m === 0 ? '' : change >= 0 ? 'up' : 'down');

      const value = Portfolio.holdingValue(state, a.id);
      row.holding.innerHTML =
        value > 0.005
          ? money(value) +
            '<br><span class="asset-kind">' +
            state.shares[a.id].toFixed(state.shares[a.id] < 1 ? 4 : 2) +
            ' units</span>'
          : '<span class="asset-kind">&mdash;</span>';

      // Sparkline shows the run so far, capped so early months stay readable.
      const series = state.market.prices[a.id].slice(0, m + 1);
      Charts.sparkline(row.spark, series.length > 1 ? series : [p, p], resolveColor(a.color));

      /* A disabled button that gives no reason is indistinguishable from a
       * broken one. Pressing Buy with an empty wallet did nothing at all and
       * said nothing at all — whatever notice was left over from the previous
       * trade just sat there, so the last thing on screen was a message about
       * some other trade entirely. */
      row.buy.disabled = state.finished || Portfolio.maxBuy(state) <= 0;
      row.sell.disabled = state.finished || value <= 0.005;
      row.input.disabled = state.finished;
      row.buy.title = state.finished
        ? 'The run has finished.'
        : row.buy.disabled
          ? 'You need more than ' + money(state.cfg.feeFlat, 2) + ' in cash — that is the flat fee on any trade.'
          : '';
      row.sell.title = state.finished
        ? 'The run has finished.'
        : row.sell.disabled
          ? 'You do not own any ' + a.name + ' to sell.'
          : '';
    });
  }

  /* ---------------- news ---------------- */

  function renderBanner(state, event) {
    const el = $('news-banner');
    if (!event) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<div class="banner' +
      (event.big ? ' big' : '') +
      '"><div class="b-head">' +
      event.headline +
      '</div><div class="b-why">' +
      event.why +
      '</div></div>';
  }

  function renderFeed(state) {
    const feed = $('feed');
    if (!state.log.length) {
      feed.innerHTML = '<li class="empty">Nothing has happened yet.</li>';
      return;
    }
    feed.innerHTML = state.log
      .map(function (entry) {
        return (
          '<li><span class="when">' +
          shortMonth(entry.month) +
          '</span><span class="what">' +
          entry.text +
          '</span></li>'
        );
      })
      .join('');
  }

  /* ---------------- results ---------------- */

  /* The payoff for the crash decisions. Every claim here is arithmetic on units
   * the student actually sold, not a guess about a path they didn't take. */
  function renderCost(state) {
    const block = $('cost-block');
    const decisions = Portfolio.decisionAnalysis(state);
    const sells = Portfolio.sellAnalysis(state);
    const rows = [];

    const VERBS = {
      sell: 'You sold everything',
      'sell-cat': 'You sold just the part that was hit',
      hold: 'You sat through it',
      buy: 'You bought more'
    };

    /* The market's own move over the following year, not the portfolio's. A
     * portfolio picks up a fresh deposit every month, so measuring it here
     * would credit the decision with money the student simply paid in later —
     * and would make whichever decision came first look like the best one. */
    decisions.forEach(function (d) {
      const window =
        d.monthsAfter <= 0
          ? 'The run ended immediately afterwards'
          : d.monthsAfter >= 12
            ? 'Over the next year the market'
            : 'Over the ' + d.monthsAfter + ' months left the market';
      const verdict =
        d.monthsAfter <= 0
          ? '.'
          : ' ' + (d.marketChange >= 0 ? 'rose' : 'fell') + ' ' + pct(Math.abs(d.marketChange)).slice(1) + '.';
      rows.push(
        '<div class="cost-row"><div class="cost-when">Month ' +
          d.month +
          '</div><div class="cost-what"><strong>' +
          VERBS[d.choice] +
          '</strong> during &ldquo;' +
          d.headline +
          '&rdquo;. You were left with ' +
          money(d.after) +
          '. ' +
          window +
          verdict +
          '</div></div>'
      );
    });

    /* Selling is not automatically a mistake — sometimes it genuinely saved
     * money, and saying so is what makes the rest of this credible. */
    if (sells.worst && Math.abs(sells.worst.cost) > 1) {
      const w = sells.worst;
      if (w.cost > 0) {
        rows.push(
          '<div class="cost-row bad"><div class="cost-when">Month ' +
            w.month +
            '</div><div class="cost-what">Your most expensive sale was <strong>' +
            w.name +
            '</strong>. You got ' +
            money(w.proceeds) +
            ' for those units. Left alone they would be worth ' +
            money(w.wouldBeWorth) +
            ' now — that one decision cost you <strong>' +
            money(w.cost) +
            '</strong>.</div></div>'
        );
      } else {
        rows.push(
          '<div class="cost-row good"><div class="cost-when">Month ' +
            w.month +
            '</div><div class="cost-what">Selling <strong>' +
            w.name +
            '</strong> was the right call. You got ' +
            money(w.proceeds) +
            ' for those units; they would only be worth ' +
            money(w.wouldBeWorth) +
            ' now, so you saved <strong>' +
            money(-w.cost) +
            '</strong>.</div></div>'
        );
      }
    }

    if (sells.rows.length > 1 && Math.abs(sells.totalCost) > 1) {
      rows.push(
        '<div class="cost-row total"><div class="cost-when">All ' +
          sells.rows.length +
          ' sales</div><div class="cost-what">Everything you sold, valued at today\'s prices, would be worth ' +
          (sells.totalCost > 0 ? money(sells.totalCost) + ' <strong>more</strong>' : money(-sells.totalCost) + ' <strong>less</strong>') +
          ' than the cash you took for it.</div></div>'
      );
    }

    if (!rows.length) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    $('cost-list').innerHTML = rows.join('');
  }

  function buildVerdict(state, s, opp) {
    const bullets = [];

    /* In a race, who won comes before everything else. */
    if (opp) {
      const them = Opponents.value(opp);
      const gap = s.nominal - them;
      if (gap >= 0) {
        bullets.push(
          '<strong>You beat ' +
            opp.level.name +
            ' by ' +
            money(gap) +
            '.</strong> ' +
            (opp.level.id === 'hard'
              ? 'That is the hard one, and it barely traded all run — beating it is a genuine result rather than a lucky month.'
              : 'Try the next difficulty up: the harder opponents trade less, not more.')
        );
      } else {
        bullets.push(
          '<strong>' +
            opp.level.name +
            ' beat you by ' +
            money(-gap) +
            '.</strong> ' +
            (opp.level.id === 'hard'
              ? 'It bought a world fund, added to it once a year, and bought more during the crashes. That is the entire strategy — and it is hard to beat because doing less is genuinely difficult.'
              : 'Look at what it actually did in its move list. It is not clever; it is just consistent.')
        );
      }
    }

    // The goal comes next, because it is the number they actually wanted.
    const goal = Goals.progress(state);
    if (goal) {
      if (goal.reached) {
        bullets.push(
          '<strong>You made it.</strong> You needed ' +
            money(goal.target) +
            ' for ' +
            state.goal.name.toLowerCase() +
            ' and finished with ' +
            money(goal.current) +
            ' — ' +
            money(goal.current - goal.target) +
            ' more than you needed.'
        );
      } else {
        bullets.push(
          '<strong>You came up ' +
            money(goal.shortfall) +
            ' short</strong> of the ' +
            money(goal.target) +
            ' you needed for ' +
            state.goal.name.toLowerCase() +
            '. Worth running it again with the same seed and a different plan to see whether the market or the strategy was the problem.'
        );
      }
    }
    const feeShare = s.contributed > 0 ? s.fees / s.contributed : 0;
    const heldCount = Market.ASSETS.filter(function (a) {
      return Portfolio.holdingValue(state, a.id) > 0.005;
    }).length;
    const catCount = Market.CATEGORIES.filter(function (c) {
      return Market.assetsInCategory(c.id).some(function (a) {
        return Portfolio.holdingValue(state, a.id) > 0.005;
      });
    }).length;
    const cashShare = s.nominal > 0 ? state.cash / s.nominal : 0;

    if (s.vsBenchmark >= 0) {
      bullets.push(
        'You finished ' +
          money(s.vsBenchmark) +
          ' ahead of simply buying the world fund and never touching it. That is a real achievement — and worth asking how much was skill and how much was the particular path this market took. Change the seed and try the same strategy again.'
      );
    } else {
      bullets.push(
        'Buying the world fund and never touching it would have finished ' +
          money(-s.vsBenchmark) +
          ' ahead of you. This is the most reliable finding in investing: most active decisions lose to patiently holding a broad fund.'
      );
    }

    bullets.push(
      'Your money grew at ' +
        plainPct(s.annualised) +
        ' a year against the benchmark’s ' +
        plainPct(s.benchAnnualised) +
        '. A gap of even one point a year compounds into a large sum over a working life.'
    );

    if (s.trades === 0) {
      bullets.push(
        'You never traded, so you paid nothing in fees at all. Doing nothing is a strategy, and often a good one.'
      );
    } else {
      const perTrade = s.fees / s.trades;
      bullets.push(
        'You made ' +
          s.trades +
          (s.trades === 1 ? ' trade' : ' trades') +
          ' and paid ' +
          money(s.fees, 2) +
          ' in fees — an average of ' +
          money(perTrade, 2) +
          ' each, or ' +
          plainPct(feeShare) +
          ' of every dollar you put in. With a ' +
          money(state.cfg.feeFlat) +
          ' flat fee on every trade, small frequent trades are far more expensive than they look.'
      );
    }

    bullets.push(
      'Your worst stretch was a fall of ' +
        plainPct(Math.abs(s.drawdown)) +
        ' from a previous high. Selling at that moment would have locked the loss in; the market recovered afterwards, as it usually has.'
    );

    if (cashShare > 0.35) {
      bullets.push(
        'You ended with ' +
          plainPct(cashShare, 0) +
          ' of your money sitting in cash. It earned ' +
          plainPct(state.cfg.savingsRate) +
          ' while prices rose ' +
          plainPct(s.inflation) +
          ' over the run, so that portion quietly lost buying power.'
      );
    }

    if (heldCount <= 1) {
      bullets.push(
        'You finished holding ' +
          (heldCount === 0 ? 'no investments at all' : 'a single asset') +
          '. Concentration magnifies both outcomes — it is the reason one piece of bad news could have undone the whole run.'
      );
    } else if (catCount >= 3) {
      bullets.push(
        'You finished spread across ' +
          heldCount +
          ' assets in ' +
          catCount +
          ' different categories. Because those categories do not move in step, that mix gave you a smoother ride than any one of them alone.'
      );
    } else if (catCount === 1) {
      bullets.push(
        'Everything you held was in one category. Owning several things from the same corner of the market is much less diversified than it feels — they tend to fall together.'
      );
    }

    bullets.push(
      'In today’s money your ' +
        money(s.nominal) +
        ' is really worth ' +
        money(s.real) +
        ', because prices rose ' +
        plainPct(s.inflation) +
        ' along the way. Any return below inflation is a loss in disguise.'
    );

    return bullets;
  }

  function renderResults(state, opp) {
    const card = $('results-card');
    if (!state.finished) {
      card.hidden = true;
      return;
    }
    const s = Portfolio.summarise(state);
    card.hidden = false;

    const years = state.market.months / Market.MONTHS_PER_YEAR;
    const YEAR_WORDS = { 5: 'Five', 10: 'Ten', 20: 'Twenty', 30: 'Thirty' };
    $('results-title').textContent = (YEAR_WORDS[years] || years) + ' years later';

    $('results-sub').textContent =
      'Seed "' + state.market.seed + '" · ' + state.market.months / 12 + ' years · ' + s.trades + ' trades';

    const tiles = [
      { k: 'Final value', v: money(s.nominal), n: 'In today’s money ' + money(s.real), term: 'real-value' },
      { k: 'Money you put in', v: money(s.contributed), n: 'Opening balance plus monthly deposits' },
      {
        k: 'Profit',
        v: signedMoney(s.profit),
        n: pct(s.totalReturn) + ' overall',
        cls: s.profit >= 0 ? 'up' : 'down'
      },
      {
        k: 'Growth per year',
        v: plainPct(s.annualised),
        n: 'Benchmark ' + plainPct(s.benchAnnualised),
        term: 'annual-return'
      },
      {
        k: 'Against the benchmark',
        v: signedMoney(s.vsBenchmark),
        n: s.vsBenchmark >= 0 ? 'You came out ahead' : 'Doing nothing would have won',
        cls: s.vsBenchmark >= 0 ? 'up' : 'down',
        term: 'benchmark'
      },
      { k: 'Fees paid', v: money(s.fees, 2), n: s.trades + ' trades', term: 'fees' },
      { k: 'Worst fall', v: plainPct(Math.abs(s.drawdown)), n: 'Peak to trough', term: 'drawdown' },
      { k: 'Inflation', v: plainPct(s.inflation), n: 'Over the whole run', term: 'inflation' }
    ];

    if (opp) {
      const them = Opponents.value(opp);
      const gap = s.nominal - them;
      tiles.splice(4, 0, {
        k: 'Against ' + opp.level.name,
        v: signedMoney(gap),
        n: gap >= 0 ? 'You won' : 'The AI won',
        cls: gap >= 0 ? 'up' : 'down'
      });
      tiles.push({
        k: opp.level.name + "'s trades",
        v: String(opp.state.tradeCount),
        n: 'You made ' + s.trades
      });
    }

    $('results-grid').innerHTML = tiles
      .map(function (t) {
        return (
          '<div class="tile"><div class="k">' +
          (t.term ? Glossary.tag(t.term, t.k) : t.k) +
          '</div><div class="v ' +
          (t.cls || '') +
          '">' +
          t.v +
          '</div><div class="n">' +
          t.n +
          '</div></div>'
        );
      })
      .join('');

    renderCost(state);
    $('share-code').textContent = Share.encode(state, opp);

    $('verdict-list').innerHTML = buildVerdict(state, s, opp)
      .map(function (b) {
        return '<li>' + b + '</li>';
      })
      .join('');
  }

  global.UI = {
    $: $,
    money: money,
    price: price,
    signedMoney: signedMoney,
    pct: pct,
    plainPct: plainPct,
    resolveColor: resolveColor,
    riskWord: function (n) {
      return RISK_WORDS[n] || '';
    },
    monthLabel: monthLabel,
    chartSeries: chartSeries,
    renderHeader: renderHeader,
    renderHero: renderHero,
    renderGoal: renderGoal,
    renderEconomy: renderEconomy,
    renderLeaderboard: renderLeaderboard,
    renderOpponent: renderOpponent,
    showDecision: showDecision,
    renderTiles: renderTiles,
    renderChartTable: renderChartTable,
    showTooltip: showTooltip,
    renderAllocation: renderAllocation,
    buildMarketRows: buildMarketRows,
    updateMarket: updateMarket,
    renderBanner: renderBanner,
    renderFeed: renderFeed,
    renderResults: renderResults
  };
})(window);
