/* DOM rendering.
 *
 * The market table's rows are built once and then updated in place rather than
 * re-created each month — rebuilding would wipe whatever amount the student had
 * typed into a trade box mid-decision. */

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
    $('tile-contributed').textContent = money(state.totalContributed);
    $('tile-contributed-note').textContent = money(state.cfg.monthlyContribution) + ' added monthly';
    $('tile-real').textContent = money(Portfolio.realValue(state, total));
    $('tile-inflation').textContent =
      'Prices up ' + plainPct(state.market.cpi[state.month] - 1) + ' since the start';
    $('tile-fees').textContent = money(state.totalFees, 2);
    $('tile-trades').textContent = state.tradeCount === 1 ? '1 trade' : state.tradeCount + ' trades';
  }

  /* ---------------- main chart ---------------- */

  function chartSeries(state) {
    return [
      {
        key: 'portfolio',
        name: 'Your portfolio',
        color: resolveColor('var(--series-portfolio)'),
        values: state.history.map(function (h) {
          return h.total;
        })
      },
      {
        key: 'benchmark',
        name: 'Index fund, bought and held',
        color: resolveColor('var(--series-index)'),
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
      '<div class="t-row"><span class="key dot" style="background:var(--series-index)"></span>Index only<span class="v">' +
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

  function allocationParts(state) {
    const parts = [];
    Market.ASSETS.forEach(function (a) {
      const v = Portfolio.holdingValue(state, a.id);
      if (v > 0.005) parts.push({ id: a.id, name: a.name, color: a.color, value: v });
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

  function buildMarketRows(state, handlers) {
    const body = $('market-body');
    body.innerHTML = '';
    Object.keys(marketRows).forEach(function (k) {
      delete marketRows[k];
    });

    Market.ASSETS.forEach(function (a) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="asset-cell"><span class="key dot" style="background:' +
        a.color +
        '"></span><span><span class="asset-name">' +
        a.name +
        '</span><br><span class="asset-kind">' +
        a.kind +
        ' · ' +
        a.ticker +
        '</span></span></div></td>' +
        '<td data-label="Risk"><span class="risk risk-' +
        a.risk +
        '">' +
        RISK_WORDS[a.risk] +
        '</span></td>' +
        '<td class="c-price" data-label="Price"></td>' +
        '<td class="c-change" data-label="1 month"></td>' +
        '<td class="col-history"><canvas class="spark"></canvas></td>' +
        '<td class="c-holding" data-label="You hold"></td>' +
        '<td data-label="Trade"><div class="trade-cell">' +
        '<input type="number" min="0" step="50" placeholder="$" aria-label="Amount in dollars to trade in ' +
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
  }

  function updateMarket(state) {
    const m = state.month;
    Market.ASSETS.forEach(function (a) {
      const row = marketRows[a.id];
      if (!row) return;

      const price = Portfolio.priceOf(state, a.id);
      const change = state.market.returns[a.id][m];
      row.price.textContent = money(price, 2);
      row.change.textContent = m === 0 ? '—' : pct(change);
      row.change.className = 'c-change ' + (m === 0 ? '' : change >= 0 ? 'up' : 'down');

      const value = Portfolio.holdingValue(state, a.id);
      row.holding.innerHTML =
        value > 0.005
          ? money(value) + '<br><span class="asset-kind">' + state.shares[a.id].toFixed(2) + ' units</span>'
          : '<span class="asset-kind">&mdash;</span>';

      // Sparkline shows the run so far, capped so early months stay readable.
      const series = state.market.prices[a.id].slice(0, m + 1);
      Charts.sparkline(row.spark, series.length > 1 ? series : [price, price], resolveColor(a.color));

      row.buy.disabled = state.finished || Portfolio.maxBuy(state) <= 0;
      row.sell.disabled = state.finished || value <= 0.005;
      row.input.disabled = state.finished;
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
      '<div class="banner"><div class="b-head">' +
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

  function buildVerdict(state, s) {
    const bullets = [];
    const feeShare = s.contributed > 0 ? s.fees / s.contributed : 0;
    const heldCount = Market.ASSETS.filter(function (a) {
      return Portfolio.holdingValue(state, a.id) > 0.005;
    }).length;
    const cashShare = s.nominal > 0 ? state.cash / s.nominal : 0;

    if (s.vsBenchmark >= 0) {
      bullets.push(
        'You finished ' +
          money(s.vsBenchmark) +
          ' ahead of simply buying the index fund and never touching it. That is a real achievement — and worth asking how much of it was skill and how much was the particular path this market took. Change the seed and try the same strategy again.'
      );
    } else {
      bullets.push(
        'Buying the index fund and never touching it would have finished ' +
          money(-s.vsBenchmark) +
          ' ahead of you. This is the single most reliable finding in investing: most active decisions lose to patiently holding a broad fund.'
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
        'You never traded, so you paid nothing in fees beyond your opening purchase. Doing nothing is a strategy, and often a good one.'
      );
    } else if (feeShare > 0.02) {
      bullets.push(
        'You made ' +
          s.trades +
          ' trades and paid ' +
          money(s.fees, 2) +
          ' in fees — ' +
          plainPct(feeShare) +
          ' of every dollar you put in, gone to costs. At half a percent a trade, activity is expensive.'
      );
    } else {
      bullets.push(
        'You made ' +
          s.trades +
          ' trades for ' +
          money(s.fees, 2) +
          ' in fees, about ' +
          plainPct(feeShare) +
          ' of the money you put in. Restrained trading kept your costs low.'
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
          ' of your money sitting in cash. It earned 2% while prices rose ' +
          plainPct(s.inflation) +
          ' over the run, so that portion quietly lost buying power.'
      );
    }

    if (heldCount <= 1) {
      bullets.push(
        'You finished holding ' +
          (heldCount === 0 ? 'no investments at all' : 'a single asset') +
          '. Concentration magnifies both outcomes — it is the reason one piece of bad news could have undone the whole decade.'
      );
    } else if (heldCount >= 4) {
      bullets.push(
        'You finished spread across ' +
          heldCount +
          ' different assets. Because they don’t move in step, that mix gave you a smoother ride than any one of them alone.'
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

  function renderResults(state) {
    const card = $('results-card');
    if (!state.finished) {
      card.hidden = true;
      return;
    }
    const s = Portfolio.summarise(state);
    card.hidden = false;

    $('results-sub').textContent =
      'Seed "' + state.market.seed + '" · ' + state.market.months / 12 + ' years · ' + s.trades + ' trades';

    const tiles = [
      { k: 'Final value', v: money(s.nominal), n: 'In today’s money ' + money(s.real) },
      { k: 'Money you put in', v: money(s.contributed), n: 'Opening balance plus monthly deposits' },
      {
        k: 'Profit',
        v: signedMoney(s.profit),
        n: pct(s.totalReturn) + ' overall',
        cls: s.profit >= 0 ? 'up' : 'down'
      },
      { k: 'Growth per year', v: plainPct(s.annualised), n: 'Benchmark ' + plainPct(s.benchAnnualised) },
      {
        k: 'Against the benchmark',
        v: signedMoney(s.vsBenchmark),
        n: s.vsBenchmark >= 0 ? 'You came out ahead' : 'Doing nothing would have won',
        cls: s.vsBenchmark >= 0 ? 'up' : 'down'
      },
      { k: 'Fees paid', v: money(s.fees, 2), n: s.trades + ' trades' },
      { k: 'Worst fall', v: plainPct(Math.abs(s.drawdown)), n: 'Peak to trough' },
      { k: 'Inflation', v: plainPct(s.inflation), n: 'Over the whole run' }
    ];

    $('results-grid').innerHTML = tiles
      .map(function (t) {
        return (
          '<div class="tile"><div class="k">' +
          t.k +
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

    $('verdict-list').innerHTML = buildVerdict(state, s)
      .map(function (b) {
        return '<li>' + b + '</li>';
      })
      .join('');
  }

  global.UI = {
    $: $,
    money: money,
    signedMoney: signedMoney,
    pct: pct,
    plainPct: plainPct,
    resolveColor: resolveColor,
    monthLabel: monthLabel,
    chartSeries: chartSeries,
    renderHeader: renderHeader,
    renderHero: renderHero,
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
