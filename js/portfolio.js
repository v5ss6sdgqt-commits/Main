/* Player state, trading, and the benchmark counterfactual.
 *
 * The benchmark is the pedagogical centrepiece: a silent second portfolio that
 * puts every dollar the player receives straight into the index fund and never
 * trades again. It pays the same fees and receives the same contributions on the
 * same months, and it runs on the identical price path, so the end-of-game
 * comparison isolates exactly one variable — the player's decisions. */

(function (global) {
  'use strict';

  /* Scaled to a fifteen-year-old's actual life: a bit saved up, and some of a
   * part-time wage going in each month. The lesson lands harder at $50 a month
   * than at a sum no student has ever held.
   *
   * Fees copy how NZ investing platforms really charge — a flat fee per trade
   * plus a small percentage. The flat part is the point: it is invisible on a
   * $5,000 trade and brutal on a $50 one, which is exactly the trap a beginner
   * making small frequent trades falls into. */
  const DEFAULTS = {
    startingCash: 1000,
    monthlyContribution: 50,
    savingsRate: 0.03, // annual interest paid on uninvested cash
    feeFlat: 3, // charged on every buy and every sell, regardless of size
    feeRate: 0.005 // plus this share of the trade's value
  };

  function feeOn(state, amount) {
    return state.cfg.feeFlat + amount * state.cfg.feeRate;
  }

  function create(market, opts) {
    const options = opts || {};
    const cfg = Object.assign({}, DEFAULTS, options);
    const shares = {};
    Market.ASSETS.forEach(function (a) {
      shares[a.id] = 0;
    });

    const state = {
      market: market,
      cfg: cfg,
      goal: options.goal || null,
      month: 0,
      cash: cfg.startingCash,
      shares: shares,
      totalFees: 0,
      totalContributed: cfg.startingCash,
      tradeCount: 0,
      benchShares: 0,
      benchFees: 0,
      history: [],
      log: [],
      /* Every sale keeps the *units* that left, not just the dollars. That is
       * what lets the end screen say what those exact units would have been
       * worth if they had been left alone — the difference between "you sold
       * some things" and "selling in month 47 cost you $1,840". */
      sells: [],
      decisions: [],
      finished: false
    };

    // The benchmark commits the opening balance immediately.
    benchInvest(state, cfg.startingCash);
    record(state);
    return state;
  }

  function priceOf(state, assetId, month) {
    const m = typeof month === 'number' ? month : state.month;
    return state.market.prices[assetId][m];
  }

  function holdingValue(state, assetId) {
    return state.shares[assetId] * priceOf(state, assetId);
  }

  function investedValue(state) {
    return Market.ASSETS.reduce(function (sum, a) {
      return sum + holdingValue(state, a.id);
    }, 0);
  }

  function totalValue(state) {
    return state.cash + investedValue(state);
  }

  function benchValue(state) {
    return state.benchShares * priceOf(state, Market.BENCHMARK_ID);
  }

  function realValue(state, nominal) {
    return nominal / state.market.cpi[state.month];
  }

  /* The benchmark pays the percentage fee but not the flat one, because it
   * represents an automatic monthly investment plan — which is how NZ platforms
   * and KiwiSaver actually work, and they do not charge a per-trade fee on a
   * scheduled contribution. Charging the flat $3 on a $50 auto-contribution
   * would hand the player a 6%-a-month head start that no real investor enjoys,
   * and the whole value of the benchmark is that it is honest. */
  function benchInvest(state, dollars) {
    if (dollars <= 0) return;
    const fee = dollars * state.cfg.feeRate;
    const net = dollars - fee;
    state.benchFees += fee;
    state.benchShares += net / priceOf(state, Market.BENCHMARK_ID);
  }

  function record(state) {
    state.history.push({
      month: state.month,
      total: totalValue(state),
      cash: state.cash,
      benchmark: benchValue(state),
      contributed: state.totalContributed,
      cpi: state.market.cpi[state.month]
    });
  }

  function addLog(state, type, text) {
    state.log.unshift({ month: state.month, type: type, text: text });
    if (state.log.length > 60) state.log.pop();
  }

  /* Returns a result object rather than throwing, so the UI can show a reason
   * next to the trade controls instead of failing silently. */
  function buy(state, assetId, dollars) {
    if (state.finished) return { ok: false, reason: 'The simulation has finished.' };
    if (state.cash <= state.cfg.feeFlat) {
      return {
        ok: false,
        reason:
          'You need more than ' + money(state.cfg.feeFlat) + ' in cash — that is the flat fee on any trade.'
      };
    }
    const amount = Math.min(dollars, maxBuy(state));
    if (!(amount > 0)) return { ok: false, reason: 'Not enough cash for that trade.' };

    const fee = feeOn(state, amount);
    const asset = Market.byId(assetId);
    state.cash -= amount + fee;
    state.shares[assetId] += amount / priceOf(state, assetId);
    state.totalFees += fee;
    state.tradeCount += 1;
    addLog(state, 'buy', 'Bought ' + money(amount) + ' of ' + asset.name + ' (fee ' + money(fee) + ')');
    return { ok: true, amount: amount, fee: fee };
  }

  function sell(state, assetId, dollars) {
    if (state.finished) return { ok: false, reason: 'The simulation has finished.' };
    const available = holdingValue(state, assetId);
    const amount = Math.min(dollars, available);
    if (!(amount > 0)) return { ok: false, reason: 'You do not own any of that.' };

    const fee = feeOn(state, amount);
    if (fee >= amount) {
      return {
        ok: false,
        reason:
          'The fee on that sale would be ' +
          money(fee) +
          ', which is more than the ' +
          money(amount) +
          ' you would get back. Selling tiny amounts costs more than it is worth.'
      };
    }

    const asset = Market.byId(assetId);
    const unitsSold = amount / priceOf(state, assetId);
    state.shares[assetId] -= unitsSold;
    if (state.shares[assetId] < 1e-9) state.shares[assetId] = 0;
    state.cash += amount - fee;
    state.totalFees += fee;
    state.tradeCount += 1;
    state.sells.push({
      month: state.month,
      assetId: assetId,
      units: unitsSold,
      proceeds: amount - fee
    });
    addLog(state, 'sell', 'Sold ' + money(amount) + ' of ' + asset.name + ' (fee ' + money(fee) + ')');
    return { ok: true, amount: amount, fee: fee };
  }

  /* Panic button. Sells every holding at this month's prices, paying the full
   * fee on each one — which is part of the lesson, since bailing out of six
   * positions costs six flat fees. */
  function sellAll(state) {
    let sold = 0;
    let fees = 0;
    const before = investedValue(state);
    Market.ASSETS.forEach(function (a) {
      const value = holdingValue(state, a.id);
      if (value <= 0.005) return;
      const result = sell(state, a.id, value);
      if (result.ok) {
        sold += result.amount;
        fees += result.fee;
      }
    });
    return { sold: sold, fees: fees, before: before };
  }

  /* Buy-the-dip button. Spreads all available cash across whatever the student
   * already holds, in their existing proportions, so it reinforces their own
   * strategy rather than quietly picking assets for them. With nothing held it
   * falls back to the broad world fund. */
  function investAllCash(state) {
    const budget = maxBuy(state);
    if (budget <= 0) return { invested: 0, fees: 0 };

    const invested = investedValue(state);
    const targets = [];
    if (invested > 0.005) {
      Market.ASSETS.forEach(function (a) {
        const value = holdingValue(state, a.id);
        if (value > 0.005) targets.push({ id: a.id, weight: value / invested });
      });
    } else {
      targets.push({ id: Market.BENCHMARK_ID, weight: 1 });
    }

    /* Each purchase pays its own flat fee, so spreading across many holdings
     * costs more. Budget per target is reduced accordingly rather than letting
     * the last few buys fail for being a couple of dollars short. */
    const perTargetFees = state.cfg.feeFlat * targets.length;
    const spendable = Math.max(0, (state.cash - perTargetFees) / (1 + state.cfg.feeRate));

    let total = 0;
    let fees = 0;
    targets.forEach(function (t) {
      const amount = spendable * t.weight;
      if (amount <= 0) return;
      const result = buy(state, t.id, amount);
      if (result.ok) {
        total += result.amount;
        fees += result.fee;
      }
    });
    return { invested: total, fees: fees };
  }

  /* What every sale actually cost, valued at the end of the run.
   *
   * For each sale: the units that left, priced at the final price, against the
   * cash actually received. A positive `cost` means those units would have been
   * worth more than the money taken for them — the concrete price of selling.
   * This is an honest statement about those units rather than a full
   * counterfactual, which would have to guess what the student did next. */
  function sellAnalysis(state) {
    const finalMonth = state.month;
    const rows = state.sells.map(function (s) {
      const finalPrice = state.market.prices[s.assetId][finalMonth];
      const wouldBeWorth = s.units * finalPrice;
      return {
        month: s.month,
        assetId: s.assetId,
        name: Market.byId(s.assetId).name,
        proceeds: s.proceeds,
        wouldBeWorth: wouldBeWorth,
        cost: wouldBeWorth - s.proceeds
      };
    });

    let worst = null;
    let totalCost = 0;
    rows.forEach(function (r) {
      totalCost += r.cost;
      if (!worst || r.cost > worst.cost) worst = r;
    });
    return { rows: rows, worst: worst, totalCost: totalCost };
  }

  function recordDecision(state, event, choice, before, after) {
    state.decisions.push({
      month: state.month,
      eventId: event.id,
      headline: event.headline,
      choice: choice,
      before: before,
      after: after
    });
  }

  /* How each crash decision turned out, judged the same way for all three
   * choices: what the portfolio was worth right after the decision, against
   * what it is worth now. */
  function decisionAnalysis(state) {
    const finalValue = totalValue(state);
    return state.decisions.map(function (d) {
      return {
        month: d.month,
        headline: d.headline,
        choice: d.choice,
        after: d.after,
        finalValue: finalValue,
        change: d.after > 0 ? finalValue / d.after - 1 : 0
      };
    });
  }

  /* Largest amount investable once both parts of the fee are covered:
   * cash = amount + flat + amount * rate, solved for amount. */
  function maxBuy(state) {
    return Math.max(0, (state.cash - state.cfg.feeFlat) / (1 + state.cfg.feeRate));
  }

  function advance(state) {
    if (state.finished || state.month >= state.market.months) return null;

    const m = state.month + 1;
    state.cash *= 1 + state.cfg.savingsRate / Market.MONTHS_PER_YEAR;
    state.month = m;

    const contribution = state.cfg.monthlyContribution;
    if (contribution > 0) {
      state.cash += contribution;
      state.totalContributed += contribution;
      benchInvest(state, contribution);
    }

    const event = state.market.events[m];
    if (event) addLog(state, 'news', event.headline);

    if (state.month >= state.market.months) state.finished = true;
    record(state);
    return event;
  }

  /* Peak-to-trough fall in portfolio value. Monthly contributions nudge this
   * slightly optimistic — new money partly refills a hole while it is being dug
   * — but at $200/month against a $10,000 base the distortion is small and the
   * number still does its job: showing how far down the ride went. */
  function maxDrawdown(history) {
    let peak = -Infinity;
    let worst = 0;
    history.forEach(function (h) {
      if (h.total > peak) peak = h.total;
      if (peak > 0) {
        const dd = h.total / peak - 1;
        if (dd < worst) worst = dd;
      }
    });
    return worst;
  }

  /* Growth rate per year, money-weighted.
   *
   * The naive version — (final / total contributed) ^ (1/years) — is badly
   * wrong here, because it charges the $200 deposited in the final month with a
   * full decade of growth it never had. On a ten-year run that understates the
   * real rate by several points and would have students concluding that
   * investing barely works. So this solves for the internal rate of return
   * against the actual monthly cash flows instead.
   *
   * The flows are one sign change (money in, then a single payout), so the NPV
   * falls monotonically in r and bisection always converges on the one root. */
  function cashFlows(state, finalValue) {
    const flows = new Array(state.month + 1).fill(0);
    flows[0] = -state.cfg.startingCash;
    for (let t = 1; t <= state.month; t++) flows[t] = -state.cfg.monthlyContribution;
    flows[state.month] += finalValue;
    return flows;
  }

  function npv(flows, rate) {
    let sum = 0;
    for (let t = 0; t < flows.length; t++) sum += flows[t] / Math.pow(1 + rate, t);
    return sum;
  }

  function annualised(state, finalValue) {
    if (state.month <= 0 || finalValue <= 0) return 0;
    const flows = cashFlows(state, finalValue);

    let lo = -0.9;
    let hi = 1.0;
    if (npv(flows, lo) < 0 || npv(flows, hi) > 0) {
      // Outside the bracket the monthly rate would be absurd either way; fall
      // back to the simple ratio rather than reporting a bogus root.
      const years = state.month / Market.MONTHS_PER_YEAR;
      return Math.pow(finalValue / state.totalContributed, 1 / years) - 1;
    }

    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(flows, mid) > 0) lo = mid;
      else hi = mid;
    }
    const monthly = (lo + hi) / 2;
    return Math.pow(1 + monthly, Market.MONTHS_PER_YEAR) - 1;
  }

  function summarise(state) {
    const nominal = totalValue(state);
    const bench = benchValue(state);
    const contributed = state.totalContributed;
    return {
      nominal: nominal,
      real: realValue(state, nominal),
      benchmark: bench,
      benchmarkReal: realValue(state, bench),
      contributed: contributed,
      profit: nominal - contributed,
      totalReturn: contributed > 0 ? nominal / contributed - 1 : 0,
      annualised: annualised(state, nominal),
      benchAnnualised: annualised(state, bench),
      vsBenchmark: nominal - bench,
      fees: state.totalFees,
      trades: state.tradeCount,
      drawdown: maxDrawdown(state.history),
      inflation: state.market.cpi[state.month] - 1
    };
  }

  function money(n) {
    return (
      '$' +
      Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  global.Portfolio = {
    DEFAULTS: DEFAULTS,
    create: create,
    buy: buy,
    sell: sell,
    sellAll: sellAll,
    investAllCash: investAllCash,
    sellAnalysis: sellAnalysis,
    decisionAnalysis: decisionAnalysis,
    recordDecision: recordDecision,
    feeOn: feeOn,
    advance: advance,
    maxBuy: maxBuy,
    priceOf: priceOf,
    holdingValue: holdingValue,
    investedValue: investedValue,
    totalValue: totalValue,
    benchValue: benchValue,
    realValue: realValue,
    summarise: summarise
  };
})(window);
