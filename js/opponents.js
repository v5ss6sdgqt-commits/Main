/* The AI opponents.
 *
 * Each one is a real portfolio — same starting cash, same monthly contributions,
 * same prices, same fees — running a strategy instead of a student. It is a fair
 * race because it is literally the same simulation; nothing here is scored or
 * fudged, the bot just trades and lives with the result.
 *
 * Two rules the strategies must obey:
 *
 *   No lookahead. A strategy may read prices up to and including the current
 *   month and nothing beyond it. Everything below goes through `trailingReturn`,
 *   which is bounded by `month`, so this is easy to keep honest.
 *
 *   No free trades. Bots pay the same $3 + 0.5% as the student. That is most of
 *   why the easy opponent loses: it trades constantly and the fees compound
 *   against it.
 *
 * ── The difficulty ladder is upside down on purpose ──
 *
 * The hardest opponent is the one that does the least. "The Chaser" switches
 * holdings every quarter and panics in every crash; "Patient" buys a world index
 * fund and essentially never touches it again. A student who works up the ladder
 * discovers that the boring strategy is the strong one by losing to it, which
 * lands harder than being told.
 *
 * Measured over 1,500 markets, the medians order as intended — Chaser $9,194,
 * Steady $10,212, Patient $10,937 — but the Chaser is streaky rather than simply
 * bad: it concentrates in one volatile asset, so its 25th-to-75th percentile
 * range is roughly $4,300 to $21,900 and a good strategy only finishes ahead of
 * it about 56% of the time. That is honest rather than ideal, and the reason is
 * a property of the price model rather than of these strategies: see the note on
 * volatility drag at the foot of this file. */

(function (global) {
  'use strict';

  /* Return over the last `lookback` months, never reading past `month`. */
  function trailingReturn(market, assetId, month, lookback) {
    const prices = market.prices[assetId];
    const from = Math.max(0, month - lookback);
    if (!prices[from] || prices[from] <= 0) return 0;
    return prices[month] / prices[from] - 1;
  }

  /* The assets that have risen most recently — what a performance-chaser buys,
   * and precisely the thing the app spends the rest of its time warning about.
   *
   * Takes a count because spreading the chase across two or three hot picks was
   * tried and made the bot markedly *better* rather than worse (median $13,070
   * against Patient's $10,937). That result is the clearest symptom of the
   * volatility-drag gap described at the foot of this file, and the reason the
   * Chaser deliberately concentrates in one. */
  function topRecent(market, month, lookback, count) {
    return Market.ASSETS.map(function (a) {
      return { id: a.id, ret: trailingReturn(market, a.id, month, lookback) };
    })
      .sort(function (x, y) {
        return y.ret - x.ret;
      })
      .slice(0, count)
      .map(function (x) {
        return x.id;
      });
  }

  /* Spend available cash across explicit weights, leaving room for one flat fee
   * per holding bought. Mirrors Portfolio.investAllCash, which allocates by
   * existing holdings instead of by a target. */
  function deploy(bot, weights) {
    const ids = Object.keys(weights).filter(function (id) {
      return weights[id] > 0;
    });
    if (!ids.length) return 0;

    const budget = (bot.cash - bot.cfg.feeFlat * ids.length) / (1 + bot.cfg.feeRate);
    // Not worth trading if fees would take more than a tenth, same bar the
    // student's "buy the dip" button uses.
    if (budget <= 0 || (bot.cfg.feeFlat * ids.length) / budget > 0.1) return 0;

    let spent = 0;
    ids.forEach(function (id) {
      const amount = budget * weights[id];
      if (amount <= 0) return;
      const r = Portfolio.buy(bot, id, amount);
      if (r.ok) spent += r.amount;
    });
    return spent;
  }

  const LEVELS = [
    {
      id: 'easy',
      name: 'The Chaser',
      difficulty: 'Easy',
      tagline: 'Chases whatever is hot. Panics in every crash. Wildly streaky.',
      why:
        'Switches into the best recent performer every three months and panic-sells every crash, paying a fee each time — about $1,500 of them over ten years. Its median result is the worst of the three, but it concentrates everything in one volatile asset, so it is streaky: usually behind, occasionally miles ahead. Beating it is likely rather than guaranteed, which is its own lesson about luck.',
      /* Two honest mechanisms make this lose, and neither is a thumb on the
       * scale. Every asset here has a similar expected return by design, so
       * concentrating in one is not punished on its own — an earlier version of
       * this strategy had the *best* median of the three, which would have taught
       * students that chasing winners pays.
       *
       * What actually costs a chaser money is churn and mistiming: dumping the
       * whole portfolio every quarter burns about 1% in fees each time, roughly
       * $1,500 over ten years, and selling into a crash then waiting six months
       * to feel safe again means buying back after the rebound. Both are exactly
       * what real beginners do. */
      act: function (bot, market, month, log, memo) {
        const event = market.events[month];

        if (event && event.crash && Portfolio.investedValue(bot) > 0.005) {
          const r = Portfolio.sellAll(bot);
          memo.panickedAt = month;
          log('panic-sold everything for $' + Math.round(r.sold).toLocaleString());
          return;
        }

        // Waits until it "feels safe" — which is to say, until after the bounce.
        if (memo.panickedAt && month - memo.panickedAt < 6) return;

        if (month === 1 || month % 3 === 0) {
          const picks = topRecent(market, month, 3, 1);
          if (Portfolio.investedValue(bot) > 0.005) Portfolio.sellAll(bot);
          const weights = {};
          picks.forEach(function (id) {
            weights[id] = 1 / picks.length;
          });
          if (deploy(bot, weights) > 0) {
            memo.panickedAt = null;
            log('switched everything into ' + Market.byId(picks[0]).name);
          }
        }
      }
    },
    {
      id: 'medium',
      name: 'Steady',
      difficulty: 'Medium',
      tagline: 'A boring mix of shares and bonds. Never panics.',
      why:
        'Splits new money 70/30 between a world fund and government bonds once a year, and never sells. Roughly what a KiwiSaver balanced fund does, and it beats most people.',
      act: function (bot, market, month, log) {
        if (month !== 1 && month % 12 !== 0) return;
        const spent = deploy(bot, { world: 0.7, nzbond: 0.3 });
        if (spent > 0) log('put ' + Math.round(spent).toLocaleString() + ' into its usual mix');
      }
    },
    {
      id: 'hard',
      name: 'Patient',
      difficulty: 'Hard',
      tagline: 'Buys the world once. Buys more when everyone else is scared.',
      why:
        'Holds a total world index fund, adds to it once a year, and buys extra during crashes instead of selling. It almost never trades — and that is exactly why it is hard to beat.',
      act: function (bot, market, month, log) {
        const event = market.events[month];

        // The one thing it does differently from doing nothing at all.
        if (event && event.crash) {
          const spent = deploy(bot, { world: 1 });
          if (spent > 0) log('bought ' + Math.round(spent).toLocaleString() + ' more while prices were down');
          return;
        }

        if (month === 1 || month % 12 === 0) {
          const spent = deploy(bot, { world: 1 });
          if (spent > 0) log('added ' + Math.round(spent).toLocaleString() + ' to the world fund');
        }
      }
    }
  ];

  function byId(id) {
    for (let i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === id) return LEVELS[i];
    }
    return LEVELS[0];
  }

  function create(levelId, market) {
    const level = byId(levelId);
    return {
      level: level,
      state: Portfolio.create(market),
      // Per-opponent scratch memory, e.g. when it last panicked.
      memo: {},
      moves: []
    };
  }

  /* Advances the bot exactly one month, in lockstep with the student, then lets
   * it act on the month that just happened. */
  function advance(opp) {
    if (!opp || opp.state.finished) return;
    Portfolio.advance(opp.state);
    const month = opp.state.month;

    opp.level.act(
      opp.state,
      opp.state.market,
      month,
      function (text) {
        opp.moves.unshift({ month: month, text: text });
        if (opp.moves.length > 40) opp.moves.pop();
      },
      opp.memo
    );
  }

  function value(opp) {
    return opp ? Portfolio.totalValue(opp.state) : 0;
  }

  /* ── Known limitation: no volatility drag ──
   *
   * market.js sets each asset's drift so that its *median* compound return
   * equals `mu`, which was the right call for teaching — the textbook
   * alternative made Ethereum look like a guaranteed loss. But it has a
   * consequence that shows up sharply here: it implies a very high arithmetic
   * mean for volatile assets, so combining several of them raises the median a
   * lot, and concentrating in one is not penalised the way it is in reality.
   *
   * That is why no amount of tuning made the Chaser reliably bad, and why
   * diversifying it made it better. Fixing it properly means specifying
   * arithmetic means and letting the median fall out as `m - sigma^2/2`, which
   * would restore the real penalty for volatility and let the Chaser lose for
   * the right reason. It is a recalibration of all sixteen assets and a new
   * default seed, so it is recorded here rather than half-done. */

  global.Opponents = {
    LEVELS: LEVELS,
    byId: byId,
    create: create,
    advance: advance,
    value: value
  };
})(window);
