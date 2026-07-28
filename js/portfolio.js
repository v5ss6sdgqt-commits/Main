/* Player state, trading, and the benchmark counterfactual.
 *
 * The benchmark is the pedagogical centrepiece: a silent second portfolio that
 * puts every dollar the player receives straight into the index fund and never
 * trades again. It pays the same fees and receives the same contributions on the
 * same months, and it runs on the identical price path, so the end-of-game
 * comparison isolates exactly one variable — the player's decisions. */

(function (global) {
  'use strict';

  const DEFAULTS = {
    startingCash: 10000,
    monthlyContribution: 200,
    savingsRate: 0.02, // annual interest paid on uninvested cash
    feeRate: 0.005 // charged on the value of every buy and every sell
  };

  function create(market, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    const shares = {};
    Market.ASSETS.forEach(function (a) {
      shares[a.id] = 0;
    });

    const state = {
      market: market,
      cfg: cfg,
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
    return state.benchShares * priceOf(state, 'index');
  }

  function realValue(state, nominal) {
    return nominal / state.market.cpi[state.month];
  }

  function benchInvest(state, dollars) {
    if (dollars <= 0) return;
    const fee = dollars * state.cfg.feeRate;
    const net = dollars - fee;
    state.benchFees += fee;
    state.benchShares += net / priceOf(state, 'index');
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
    const amount = Math.min(dollars, maxBuy(state));
    if (!(amount > 0)) return { ok: false, reason: 'Not enough cash for that trade.' };

    const fee = amount * state.cfg.feeRate;
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

    const fee = amount * state.cfg.feeRate;
    const asset = Market.byId(assetId);
    state.shares[assetId] -= amount / priceOf(state, assetId);
    if (state.shares[assetId] < 1e-9) state.shares[assetId] = 0;
    state.cash += amount - fee;
    state.totalFees += fee;
    state.tradeCount += 1;
    addLog(state, 'sell', 'Sold ' + money(amount) + ' of ' + asset.name + ' (fee ' + money(fee) + ')');
    return { ok: true, amount: amount, fee: fee };
  }

  // Largest amount investable once the fee charged on top is covered.
  function maxBuy(state) {
    return Math.max(0, state.cash / (1 + state.cfg.feeRate));
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
