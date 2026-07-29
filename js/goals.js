/* Goals — the thing that makes any of this matter.
 *
 * Without a target, the app grows a number and the student has no reason to
 * prefer one number over another. With one, "should I put it all in crypto"
 * stops being idle curiosity and becomes a real question with a consequence.
 *
 * Targets are priced off the annual return they demand, not off a multiple of
 * what the student puts in. That distinction is the whole feature working or
 * not, because compounding is not linear in time: a flat multiple of
 * contributions is a completely different challenge at each run length.
 *
 * The old multiples (1.25x / 1.55x / 2.0x of contributions) demanded this:
 *
 *              5 years   10 years   20 years
 *   Moving out   7.0%      4.3%       2.1%
 *   First car   12.5%      7.5%       3.8%
 *   Big OE      20.8%     11.2%       5.9%
 *
 * So over twenty years every goal was below the world fund's own expectation
 * and effectively automatic, while over five years the Big OE needed 20.8% a
 * year and could not be reached by any strategy in this market. The feature
 * only worked at the ten-year length it was designed at.
 *
 * Pricing by rate makes each tier mean the same thing everywhere:
 *
 *   4%  — beats cash in the bank, out of reach for pure saving
 *   8%  — roughly what a broad share fund is expected to do
 *   12% — needs a strong run or genuine risk-taking, and often will not happen
 *
 * Cash at 3% cannot reach even the easiest one at any length. That is
 * deliberate: the point of a goal is that saving alone will not get you there. */

(function (global) {
  'use strict';

  const GOALS = [
    {
      id: 'flat',
      name: 'Moving out',
      rate: 0.04,
      blurb: 'Bond, a few weeks of rent up front, and something to sleep on.'
    },
    {
      id: 'car',
      name: 'First car',
      rate: 0.08,
      blurb: 'A tidy second-hand car, on the road with a warrant and rego.'
    },
    {
      id: 'oe',
      name: 'Big OE',
      rate: 0.12,
      blurb: 'Flights out, and enough left to land on your feet overseas.'
    },
    {
      id: 'none',
      name: 'No goal',
      rate: 0,
      blurb: 'Just see what happens.'
    }
  ];

  function byId(id) {
    for (let i = 0; i < GOALS.length; i++) {
      if (GOALS[i].id === id) return GOALS[i];
    }
    return GOALS[0];
  }

  /* What the student will have put in by the end of the run. Not the target any
   * more, but still worth having: the results screen sets the final value
   * against it, and the goal card uses it to say how much of the target has to
   * come from growth rather than from deposits. */
  function totalContributions(cfg, months) {
    return cfg.startingCash + cfg.monthlyContribution * months;
  }

  /* The target is where the opening balance and every monthly deposit end up if
   * the whole lot grows at the goal's rate. Rounded to something that reads like
   * a real price rather than a computation. */
  function targetFor(goalId, cfg, months) {
    const goal = byId(goalId);
    if (!goal.rate) return 0;
    const raw = project(cfg.startingCash, cfg.monthlyContribution, months, goal.rate);
    const step = raw > 20000 ? 500 : 250;
    return Math.round(raw / step) * step;
  }

  /* Value of the portfolio at the end of the run if it grew at `annualRate` from
   * here, with contributions continuing every month. Used to answer "what would
   * I need from here?", which is far more motivating than a static target. */
  function project(current, monthlyContribution, monthsLeft, annualRate) {
    const r = annualRate / 12;
    if (monthsLeft <= 0) return current;
    if (Math.abs(r) < 1e-9) return current + monthlyContribution * monthsLeft;
    const growth = Math.pow(1 + r, monthsLeft);
    return current * growth + monthlyContribution * ((growth - 1) / r);
  }

  /* The annual return needed from here to land exactly on the target.
   *
   * Projected value rises monotonically with the rate, so bisection always finds
   * the single root. Returns null when the target is already met, or when even
   * an absurd rate could not get there — in both cases the UI has something more
   * useful to say than a number. */
  function requiredReturn(state) {
    const target = state.goal ? state.goal.target : 0;
    if (!target) return null;

    const current = Portfolio.totalValue(state);
    if (current >= target) return null;

    const monthsLeft = state.market.months - state.month;
    if (monthsLeft <= 0) return null;

    const contribution = state.cfg.monthlyContribution;
    let lo = -0.95;
    let hi = 3.0;
    if (project(current, contribution, monthsLeft, hi) < target) return Infinity;
    if (project(current, contribution, monthsLeft, lo) > target) return -Infinity;

    for (let i = 0; i < 120; i++) {
      const mid = (lo + hi) / 2;
      if (project(current, contribution, monthsLeft, mid) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function progress(state) {
    const target = state.goal ? state.goal.target : 0;
    if (!target) return null;
    const current = Portfolio.totalValue(state);
    return {
      target: target,
      current: current,
      fraction: Math.max(0, Math.min(1, current / target)),
      reached: current >= target,
      shortfall: Math.max(0, target - current),
      required: requiredReturn(state)
    };
  }

  global.Goals = {
    GOALS: GOALS,
    byId: byId,
    targetFor: targetFor,
    progress: progress,
    requiredReturn: requiredReturn,
    project: project
  };
})(window);
