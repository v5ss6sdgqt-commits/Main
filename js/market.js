/* The market simulation.
 *
 * Prices follow geometric Brownian motion stepped one month at a time. Each
 * asset's shock is split into a shared market factor and an idiosyncratic part,
 * weighted by `rho`. That correlation structure is what makes diversification
 * actually reduce volatility in the sim rather than just appearing to — without
 * it, spreading money across assets would be a lesson the numbers don't support.
 *
 * The drift and volatility figures are rough real-world long-run values so the
 * risk/return trade-off students discover here matches the one outside. */

(function (global) {
  'use strict';

  const MONTHS_PER_YEAR = 12;
  const DT = 1 / MONTHS_PER_YEAR;

  /* Entity colors are fixed here and used by every chart, legend and table row
   * in the app, so an asset is the same color everywhere it appears. Validated
   * for colorblind separation in both light and dark mode. */
  const ASSETS = [
    {
      id: 'bonds',
      name: 'Government Bond Fund',
      ticker: 'GOVT',
      kind: 'Bonds',
      color: 'var(--series-bonds)',
      start: 100,
      mu: 0.04,
      sigma: 0.06,
      rho: 0.15,
      risk: 1,
      blurb:
        'A loan to the government. Low return, but it barely moves — and it often rises when stocks fall.'
    },
    {
      id: 'index',
      name: 'Total Market Index Fund',
      ticker: 'TMI',
      kind: 'Index fund',
      color: 'var(--series-index)',
      start: 100,
      mu: 0.09,
      sigma: 0.15,
      rho: 1.0,
      risk: 2,
      blurb:
        'A slice of every company at once. You get the whole market’s average return without picking winners.'
    },
    {
      id: 'nimbus',
      name: 'Nimbus Software',
      ticker: 'NMBS',
      kind: 'Growth stock',
      color: 'var(--series-nimbus)',
      start: 100,
      mu: 0.12,
      sigma: 0.34,
      rho: 0.75,
      risk: 4,
      blurb:
        'One fast-growing tech company. Higher expected return, but a single bad earnings report hits hard.'
    },
    {
      id: 'ridgeline',
      name: 'Ridgeline Energy',
      ticker: 'RDGE',
      kind: 'Cyclical stock',
      color: 'var(--series-ridgeline)',
      start: 100,
      mu: 0.075,
      sigma: 0.28,
      rho: 0.55,
      risk: 3,
      blurb:
        'An oil and gas producer. Swings with energy prices, so it often zigs when the rest of the market zags.'
    },
    {
      id: 'bitcorn',
      name: 'Bitcorn',
      ticker: 'BTCN',
      kind: 'Crypto',
      color: 'var(--series-bitcorn)',
      start: 100,
      mu: 0.14,
      sigma: 0.75,
      rho: 0.3,
      risk: 5,
      blurb:
        'A cryptocurrency. Enormous swings in both directions — the highest expected return here, and by far the widest range of outcomes.'
    }
  ];

  /* News events apply an extra shock on top of the random walk. They exist to
   * make the abstract point that prices move when information arrives, and to
   * guarantee students live through at least one scary drawdown. `weight` is the
   * relative chance of being chosen once an event fires at all. */
  const EVENTS = [
    {
      id: 'rate-hike',
      headline: 'Central bank raises interest rates',
      why:
        'Borrowing gets more expensive, so future company profits are worth less today. Existing bonds paying the old lower rate become less attractive too.',
      weight: 10,
      effects: { bonds: -0.03, index: -0.04, nimbus: -0.07, ridgeline: -0.03, bitcorn: -0.09 }
    },
    {
      id: 'rate-cut',
      headline: 'Central bank cuts interest rates',
      why:
        'Cheaper borrowing tends to lift company profits and asset prices. Bonds issued at the old higher rate gain value.',
      weight: 10,
      effects: { bonds: 0.025, index: 0.035, nimbus: 0.06, ridgeline: 0.025, bitcorn: 0.08 }
    },
    {
      id: 'jobs-strong',
      headline: 'Jobs report beats expectations',
      why: 'More people working means more spending, which usually means higher company earnings.',
      weight: 12,
      effects: { index: 0.025, nimbus: 0.03, ridgeline: 0.02 }
    },
    {
      id: 'inflation-hot',
      headline: 'Inflation comes in higher than forecast',
      why:
        'Rising prices eat into what your money can buy, and raise the odds the central bank hikes rates to cool things down.',
      weight: 9,
      effects: { bonds: -0.025, index: -0.03, nimbus: -0.045, ridgeline: 0.02, bitcorn: -0.05 }
    },
    {
      id: 'nimbus-beat',
      headline: 'Nimbus Software crushes earnings forecast',
      why:
        'Company-specific news moves that company far more than the market. This is the risk you take on when you buy a single stock instead of a fund.',
      weight: 9,
      effects: { nimbus: 0.15, index: 0.005 }
    },
    {
      id: 'nimbus-miss',
      headline: 'Nimbus Software warns on slowing sales',
      why:
        'A single company can fall hard on its own news while the rest of the market barely notices. A fund would have spread this out.',
      weight: 9,
      effects: { nimbus: -0.17, index: -0.005 }
    },
    {
      id: 'oil-shock',
      headline: 'Supply disruption sends oil prices soaring',
      why:
        'Energy producers profit from higher oil prices, while everyone who buys fuel pays more. This is why Ridgeline often moves opposite the market.',
      weight: 8,
      effects: { ridgeline: 0.14, index: -0.02, nimbus: -0.03 }
    },
    {
      id: 'oil-glut',
      headline: 'Oil prices slump on oversupply',
      why: 'Cheap energy squeezes producers but lowers costs for almost every other business.',
      weight: 8,
      effects: { ridgeline: -0.13, index: 0.01 }
    },
    {
      id: 'crypto-crackdown',
      headline: 'Major economy announces crypto crackdown',
      why:
        'Crypto prices depend heavily on what regulators allow. There is no underlying business producing profits to fall back on.',
      weight: 7,
      effects: { bitcorn: -0.33 }
    },
    {
      id: 'crypto-adoption',
      headline: 'Large payment network adds Bitcorn support',
      why: 'Wider acceptance raises demand. Crypto swings this violently in both directions.',
      weight: 7,
      effects: { bitcorn: 0.38 }
    },
    {
      id: 'recession',
      headline: 'Economy officially enters recession',
      why:
        'In a downturn almost everything risky falls together — and government bonds usually rise as investors look for safety. This is diversification earning its keep.',
      weight: 4,
      effects: { bonds: 0.035, index: -0.13, nimbus: -0.19, ridgeline: -0.16, bitcorn: -0.24 }
    },
    {
      id: 'recovery',
      headline: 'Economy rebounds faster than expected',
      why: 'Recoveries lift risky assets the most, which is why selling during a crash can be so costly.',
      weight: 5,
      effects: { bonds: -0.01, index: 0.09, nimbus: 0.14, ridgeline: 0.12, bitcorn: 0.2 }
    },
    {
      id: 'bank-stress',
      headline: 'Banking sector under stress',
      why: 'Worry about the financial system spreads quickly, because banks lend to everyone else.',
      weight: 5,
      effects: { bonds: 0.02, index: -0.08, nimbus: -0.1, ridgeline: -0.07, bitcorn: -0.14 }
    },
    {
      id: 'productivity',
      headline: 'New technology drives a productivity boom',
      why: 'Companies producing more with the same resources earn more, and tech companies benefit first.',
      weight: 6,
      effects: { index: 0.05, nimbus: 0.11 }
    }
  ];

  const EVENT_CHANCE_PER_MONTH = 0.3;
  const BASE_INFLATION = 0.025;

  function totalEventWeight() {
    return EVENTS.reduce(function (sum, e) {
      return sum + e.weight;
    }, 0);
  }

  function chooseEvent(rng) {
    let roll = rng.next() * totalEventWeight();
    for (let i = 0; i < EVENTS.length; i++) {
      roll -= EVENTS[i].weight;
      if (roll <= 0) return EVENTS[i];
    }
    return EVENTS[EVENTS.length - 1];
  }

  /* Expected monthly log drag the news events impose on an asset.
   *
   * Percentage shocks don't cancel: a -33% crash followed by a +38% rally leaves
   * you down 7.5%, not up 5%. Left uncorrected that asymmetry would quietly push
   * every asset's long-run return below its stated figure — worst for crypto,
   * which has the biggest shocks. Subtracting this from the drift lets events
   * add drama without secretly rewriting the risk/return table students are
   * being asked to reason about. */
  function eventLogDrag(assetId) {
    const total = totalEventWeight();
    let sum = 0;
    EVENTS.forEach(function (e) {
      const effect = e.effects[assetId];
      if (typeof effect === 'number') {
        sum += (e.weight / total) * Math.log(1 + effect);
      }
    });
    return EVENT_CHANCE_PER_MONTH * sum;
  }

  /* Precomputes the entire price history up front. Doing it this way keeps the
   * benchmark portfolio honest: it runs on exactly the same numbers the player
   * saw, so the end-of-game comparison is a true counterfactual rather than a
   * separately generated path that got luckier or unluckier. */
  function generate(seedText, months) {
    const rng = Rng.make(seedText);
    const prices = {};
    const returns = {};

    ASSETS.forEach(function (a) {
      prices[a.id] = [a.start];
      returns[a.id] = [0];
    });

    const events = [null];
    const cpi = [1];

    const drag = {};
    ASSETS.forEach(function (a) {
      drag[a.id] = eventLogDrag(a.id);
    });

    for (let m = 1; m <= months; m++) {
      const marketShock = rng.normal();

      let event = null;
      if (rng.next() < EVENT_CHANCE_PER_MONTH) {
        event = chooseEvent(rng);
      }
      events.push(event);

      ASSETS.forEach(function (a) {
        const own = rng.normal();
        const z = a.rho * marketShock + Math.sqrt(1 - a.rho * a.rho) * own;
        /* `mu` is the compound growth rate a typical path actually achieves, so
         * it goes straight into the log drift. Using the textbook
         * `mu - sigma^2/2` here would make it the *arithmetic* mean instead, and
         * volatility drag would pull the typical outcome far below it — at
         * Bitcorn's 75% volatility that alone costs 28 points a year, which
         * would teach students that crypto is a certain loss rather than a wide
         * spread of outcomes. */
        const drift = a.mu * DT - drag[a.id];
        const diffusion = a.sigma * Math.sqrt(DT) * z;
        let r = Math.exp(drift + diffusion) - 1;

        if (event && typeof event.effects[a.id] === 'number') {
          r = (1 + r) * (1 + event.effects[a.id]) - 1;
        }

        const prev = prices[a.id][m - 1];
        // Floor at a cent so a catastrophic run can never produce a
        // non-positive price and break the share math downstream.
        const next = Math.max(0.01, prev * (1 + r));
        prices[a.id].push(next);
        returns[a.id].push(next / prev - 1);
      });

      const infl = BASE_INFLATION / MONTHS_PER_YEAR + (rng.normal() * 0.004) / Math.sqrt(12);
      cpi.push(cpi[m - 1] * (1 + Math.max(-0.01, infl)));
    }

    return { seed: seedText, months: months, prices: prices, returns: returns, events: events, cpi: cpi };
  }

  global.Market = {
    ASSETS: ASSETS,
    EVENTS: EVENTS,
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    BASE_INFLATION: BASE_INFLATION,
    generate: generate,
    byId: function (id) {
      return ASSETS.filter(function (a) {
        return a.id === id;
      })[0];
    }
  };
})(window);
