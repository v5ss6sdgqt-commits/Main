/* Goals — the thing that makes any of this matter.
 *
 * Without a target, the app grows a number and the student has no reason to
 * prefer one number over another. With one, "should I put it all in crypto"
 * stops being idle curiosity and becomes a real question with a consequence.
 *
 * Targets scale with the length of the run rather than being fixed dollar
 * amounts. A fixed $11,000 car is a stretch over ten years and trivial over
 * twenty, which would quietly switch the feature off for longer runs. Scaling by
 * total contributions keeps each goal about as hard whichever length is chosen,
 * and the multipliers below are the actual difficulty dial:
 *
 *   1.25x — reachable with modest investing, out of reach for pure cash
 *   1.55x — needs real exposure to shares
 *   2.00x — needs either a strong decade or genuine risk-taking
 *
 * Pure cash at 3% turns $7,000 of contributions into about $8,100 over ten
 * years, so even the easiest goal cannot be saved into. That is deliberate. */

(function (global) {
  'use strict';

  const GOALS = [
    {
      id: 'flat',
      name: 'Moving out',
      multiple: 1.25,
      blurb: 'Bond, a few weeks of rent up front, and something to sleep on.'
    },
    {
      id: 'car',
      name: 'First car',
      multiple: 1.55,
      blurb: 'A tidy second-hand car, on the road with a warrant and rego.'
    },
    {
      id: 'oe',
      name: 'Big OE',
      multiple: 2.0,
      blurb: 'Flights out, and enough left to land on your feet overseas.'
    },
    {
      id: 'none',
      name: 'No goal',
      multiple: 0,
      blurb: 'Just see what happens.'
    }
  ];

  function byId(id) {
    for (let i = 0; i < GOALS.length; i++) {
      if (GOALS[i].id === id) return GOALS[i];
    }
    return GOALS[0];
  }

  /* What the student will have put in by the end of the run, which is what the
   * target is priced against. */
  function totalContributions(cfg, months) {
    return cfg.startingCash + cfg.monthlyContribution * months;
  }

  // Rounded to something that reads like a real price rather than a computation.
  function targetFor(goalId, cfg, months) {
    const goal = byId(goalId);
    if (!goal.multiple) return 0;
    const raw = totalContributions(cfg, months) * goal.multiple;
    return Math.round(raw / 500) * 500;
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
