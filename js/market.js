/* The market simulation.
 *
 * Prices follow geometric Brownian motion stepped one month at a time. Each
 * asset's shock is split between two shared factors — a world market factor and
 * a separate New Zealand factor — plus its own idiosyncratic noise. The second
 * factor is what makes NZ shares move together more than they move with Wall
 * Street, which is both true and the reason holding Mainfreight and Apple is
 * genuinely more diversified than holding Mainfreight and Fisher & Paykel.
 *
 * ── The most important design decision in this file ──
 *
 * Every asset carries two return figures, and they are deliberately different:
 *
 *   `past` is roughly what the real thing actually returned, historically.
 *   `mu`   is what the simulation assumes it will return from here.
 *
 * If the simulation used past returns as future returns, it would teach students
 * that the winning move is to buy whatever won last decade — Nvidia at 33% a
 * year, forever. That is precisely the mistake real investors make, and a
 * simulator that rewards it is worse than no simulator.
 *
 * So `mu` is shrunk hard toward an ordinary share-like return, and the
 * individual companies all sit within about two points of each other regardless
 * of how spectacular or dismal their history was. What stays different between
 * them is `sigma` — risk. That asymmetry is real: a company's past *volatility*
 * predicts its future volatility fairly well, while its past *return* barely
 * predicts its future return at all. The app shows both numbers side by side and
 * the glossary explains the gap, because noticing it is the single most valuable
 * thing a fifteen-year-old can take away from this.
 *
 * ── On the numbers ──
 *
 * Historical figures are approximate, rounded, and meant as teaching context
 * rather than data. Prices are all in NZD; currency conversion is not modelled,
 * which is a real simplification — see the `currency` glossary entry. */

(function (global) {
  'use strict';

  const MONTHS_PER_YEAR = 12;
  const DT = 1 / MONTHS_PER_YEAR;

  /* The fund the benchmark buys and holds. A total world fund is the most
   * defensible "just do the boring thing" option — it is what the passive
   * argument actually recommends. */
  const BENCHMARK_ID = 'world';

  const CATEGORIES = [
    {
      id: 'defensive',
      name: 'Safe stuff',
      color: 'var(--cat-defensive)',
      blurb: 'Barely moves. Low return, but you can count on it being there.'
    },
    {
      id: 'funds',
      name: 'Index funds',
      color: 'var(--cat-funds)',
      blurb: 'One purchase buys a slice of hundreds of companies at once.'
    },
    {
      id: 'nz',
      name: 'NZ companies',
      color: 'var(--cat-nz)',
      blurb: 'Individual businesses listed on the NZX, here in New Zealand.'
    },
    {
      id: 'world',
      name: 'International companies',
      color: 'var(--cat-world)',
      blurb: 'Big overseas companies you have probably heard of.'
    },
    {
      id: 'crypto',
      name: 'Crypto',
      color: 'var(--cat-crypto)',
      blurb: 'No company, no profits, no floor. Moves further than anything else here.'
    }
  ];

  /* start   — a plausible current price in NZD, so the numbers feel like a real
   *           trading screen rather than everything beginning at $100.
   * past    — approximate real long-run return, as teaching context only.
   * mu      — expected return the simulation uses (see the header).
   * sigma   — annual volatility.
   * rhoW    — correlation with the world market factor.
   * rhoNz   — correlation with the New Zealand factor.
   *           rhoW^2 + rhoNz^2 must stay at or below 1. */
  const ASSETS = [
    /* ---------------- safe stuff ---------------- */
    {
      id: 'nzbond',
      name: 'NZ Government Bond Fund',
      ticker: 'NGB',
      where: 'NZX',
      category: 'defensive',
      color: 'var(--series-nzbond)',
      start: 1.35,
      past: { ret: 0.045, since: 'past 20 years' },
      mu: 0.04,
      sigma: 0.05,
      rhoW: 0.1,
      rhoNz: 0.1,
      risk: 1,
      what: 'A pile of loans to the New Zealand government.',
      blurb:
        'You lend the government money and it pays you interest. About as safe as investing gets, and it often goes up when shares crash.'
    },
    {
      id: 'kiwisaver',
      name: 'KiwiSaver Balanced Fund',
      ticker: 'BAL',
      where: 'Fund',
      category: 'defensive',
      color: 'var(--series-kiwisaver)',
      start: 3.2,
      past: { ret: 0.065, since: 'since 2007' },
      mu: 0.055,
      sigma: 0.08,
      rhoW: 0.72,
      rhoNz: 0.25,
      risk: 1,
      what: 'A ready-made mix of shares and bonds — the kind of fund your KiwiSaver is in.',
      blurb:
        'Somebody else picks the mix: roughly half shares, half bonds. Smoother than pure shares, and lower returns to match. This is what most New Zealanders actually own.'
    },

    /* ---------------- index funds ---------------- */
    {
      id: 'nzx50',
      name: 'S&P/NZX 50 Fund',
      ticker: 'FNZ',
      where: 'NZX',
      category: 'funds',
      color: 'var(--series-nzx50)',
      start: 3.6,
      past: { ret: 0.095, since: 'past 20 years' },
      mu: 0.075,
      sigma: 0.13,
      rhoW: 0.5,
      rhoNz: 0.62,
      risk: 2,
      what: 'The 50 biggest companies listed in New Zealand, in one purchase.',
      blurb:
        'Buys a slice of the 50 largest NZ companies at once. If one of them collapses, the other 49 carry on.'
    },
    {
      id: 'sp500',
      name: 'S&P 500 Fund',
      ticker: 'USF',
      where: 'USA',
      category: 'funds',
      color: 'var(--series-sp500)',
      start: 12.5,
      past: { ret: 0.105, since: 'past 20 years' },
      mu: 0.08,
      sigma: 0.155,
      rhoW: 0.96,
      rhoNz: 0,
      risk: 2,
      what: 'The 500 biggest companies in the United States.',
      blurb:
        'Apple, Microsoft, Amazon and 497 others in a single purchase. The most-owned fund on earth.'
    },
    {
      id: 'world',
      name: 'Total World Fund',
      ticker: 'TWF',
      where: 'Global',
      category: 'funds',
      color: 'var(--series-world)',
      start: 4.8,
      past: { ret: 0.085, since: 'past 20 years' },
      mu: 0.08,
      sigma: 0.145,
      rhoW: 1.0,
      rhoNz: 0,
      risk: 2,
      what: 'Thousands of companies across every country that has a stock market.',
      blurb:
        'The whole world in one purchase. This is the fund the grey benchmark line buys and then never touches again — the thing you have to beat.'
    },

    /* ---------------- NZ companies ---------------- */
    {
      id: 'fph',
      name: 'Fisher & Paykel Healthcare',
      ticker: 'FPH',
      where: 'NZX',
      category: 'nz',
      color: 'var(--series-fph)',
      start: 33.5,
      past: { ret: 0.16, since: 'past 20 years' },
      mu: 0.085,
      sigma: 0.26,
      rhoW: 0.42,
      rhoNz: 0.42,
      risk: 3,
      what: 'Makes breathing machines and hospital equipment, sold to about 120 countries.',
      blurb:
        'One of very few NZ companies that sells to the whole world. A quietly outstanding history — which is exactly why the expected return below looks so much smaller than the past one.'
    },
    {
      id: 'mft',
      name: 'Mainfreight',
      ticker: 'MFT',
      where: 'NZX',
      category: 'nz',
      color: 'var(--series-mft)',
      start: 68.0,
      past: { ret: 0.15, since: 'past 20 years' },
      mu: 0.085,
      sigma: 0.27,
      rhoW: 0.45,
      rhoNz: 0.45,
      risk: 3,
      what: 'Moves freight around the world by truck, ship and plane.',
      blurb:
        'Started with one truck in Auckland in 1978. Boring business, remarkable record. Rises and falls with how much stuff the world is shipping.'
    },
    {
      id: 'xro',
      name: 'Xero',
      ticker: 'XRO',
      where: 'NZX / ASX',
      category: 'nz',
      color: 'var(--series-xro)',
      start: 175.0,
      past: { ret: 0.22, since: 'since 2007' },
      mu: 0.09,
      sigma: 0.42,
      rhoW: 0.55,
      rhoNz: 0.35,
      risk: 4,
      what: 'Accounting software that small businesses pay for monthly.',
      blurb:
        'NZ’s big tech success story. Fast growth, and priced as though the growth will continue — which means it falls hard whenever that gets doubted.'
    },
    {
      id: 'mel',
      name: 'Meridian Energy',
      ticker: 'MEL',
      where: 'NZX',
      category: 'nz',
      color: 'var(--series-mel)',
      start: 5.9,
      past: { ret: 0.11, since: 'since 2013' },
      mu: 0.075,
      sigma: 0.21,
      rhoW: 0.22,
      rhoNz: 0.5,
      risk: 3,
      what: 'Generates electricity from hydro dams and wind farms.',
      blurb:
        'People buy power in good times and bad, so it is steadier than most shares. Its weak spot is a dry year, when the lakes run low.'
    },
    {
      id: 'atm',
      name: 'a2 Milk',
      ticker: 'ATM',
      where: 'NZX',
      category: 'nz',
      color: 'var(--series-atm)',
      start: 7.2,
      past: { ret: 0.13, since: 'past 20 years' },
      mu: 0.08,
      sigma: 0.48,
      rhoW: 0.25,
      rhoNz: 0.38,
      risk: 4,
      what: 'Sells infant formula and milk, mostly into China.',
      blurb:
        'Went up roughly thirty-fold, then lost about 80% of its value in under two years. That average return hides a ride almost nobody actually sat through.'
    },
    {
      id: 'air',
      name: 'Air New Zealand',
      ticker: 'AIR',
      where: 'NZX',
      category: 'nz',
      color: 'var(--series-air)',
      start: 0.62,
      past: { ret: 0.02, since: 'past 20 years' },
      mu: 0.07,
      sigma: 0.36,
      rhoW: 0.38,
      rhoNz: 0.45,
      risk: 4,
      what: 'The national airline.',
      blurb:
        'A famous company and a famously poor long-run investment. Fuel costs, weather, pandemics and price wars all land on the same balance sheet. Being well known is not the same as being a good buy.'
    },

    /* ---------------- international companies ---------------- */
    {
      id: 'aapl',
      name: 'Apple',
      ticker: 'AAPL',
      where: 'USA',
      category: 'world',
      color: 'var(--series-aapl)',
      start: 228.0,
      past: { ret: 0.24, since: 'past 20 years' },
      mu: 0.085,
      sigma: 0.29,
      rhoW: 0.78,
      rhoNz: 0,
      risk: 3,
      what: 'iPhones, Macs, and a very large services business.',
      blurb:
        'One of the most valuable companies ever. Its past return is extraordinary and almost certainly not repeatable — a company this size cannot grow thirty-fold again.'
    },
    {
      id: 'nvda',
      name: 'Nvidia',
      ticker: 'NVDA',
      where: 'USA',
      category: 'world',
      color: 'var(--series-nvda)',
      start: 185.0,
      past: { ret: 0.33, since: 'past 20 years' },
      mu: 0.09,
      sigma: 0.52,
      rhoW: 0.72,
      rhoNz: 0,
      risk: 4,
      what: 'Designs the chips that AI systems run on.',
      blurb:
        'The best-performing large share of the last two decades. Compare its two return figures below — that gap is the whole lesson about chasing winners.'
    },
    {
      id: 'tsla',
      name: 'Tesla',
      ticker: 'TSLA',
      where: 'USA',
      category: 'world',
      color: 'var(--series-tsla)',
      start: 330.0,
      past: { ret: 0.35, since: 'since 2010' },
      mu: 0.085,
      sigma: 0.6,
      rhoW: 0.62,
      rhoNz: 0,
      risk: 5,
      what: 'Electric cars, batteries, and a lot of investor argument.',
      blurb:
        'Has repeatedly halved and repeatedly doubled. Its price depends heavily on belief about the future, which can change faster than any factory can.'
    },

    /* ---------------- crypto ---------------- */
    {
      id: 'btc',
      name: 'Bitcoin',
      ticker: 'BTC',
      where: 'Crypto',
      category: 'crypto',
      color: 'var(--series-btc)',
      start: 178000,
      past: { ret: 0.6, since: 'since 2013' },
      mu: 0.09,
      sigma: 0.7,
      rhoW: 0.32,
      rhoNz: 0,
      risk: 5,
      what: 'A digital currency with no company, no profits and no government behind it.',
      blurb:
        'You can buy a fraction — nobody buys a whole one. Has fallen more than 70% four separate times and recovered each time so far. "So far" is doing a lot of work in that sentence.'
    },
    {
      id: 'eth',
      name: 'Ethereum',
      ticker: 'ETH',
      where: 'Crypto',
      category: 'crypto',
      color: 'var(--series-eth)',
      start: 6500,
      past: { ret: 0.45, since: 'since 2015' },
      mu: 0.09,
      sigma: 0.85,
      rhoW: 0.35,
      rhoNz: 0,
      risk: 5,
      what: 'A network other crypto projects are built on top of.',
      blurb:
        'The most volatile thing on this board. Expected to do no better than shares over time, while moving roughly six times as much along the way.'
    }
  ];

  /* News events apply an extra shock on top of the random walk, so students see
   * prices move because something happened rather than for no visible reason.
   *
   * `cat` applies to a whole category, `effects` to named assets; both compose
   * multiplicatively, so a global crash can hit every share at once and still
   * hit the riskiest ones harder. `weight` is the relative chance of being
   * picked once an event fires at all. `big` marks the ones worth pausing
   * auto-play for. */
  const EVENTS = [
    {
      id: 'ocr-hike',
      headline: 'Reserve Bank raises the OCR to cool inflation',
      why:
        'The Official Cash Rate is the interest rate the Reserve Bank sets. Push it up and every mortgage and business loan gets dearer, so people spend less and companies earn less. Money also earns more sitting safely in the bank, which makes risky things look less worth it.',
      weight: 10,
      cat: { funds: -0.03, nz: -0.04, world: -0.03, crypto: -0.07 },
      effects: { nzbond: -0.02, kiwisaver: -0.015, mel: 0.01 }
    },
    {
      id: 'ocr-cut',
      headline: 'Reserve Bank cuts the OCR',
      why:
        'Cheaper borrowing means people spend more and companies borrow to grow, so share prices usually rise. Bonds bought back when rates were higher become more valuable, because they still pay the old better rate.',
      weight: 10,
      cat: { funds: 0.03, nz: 0.035, world: 0.03, crypto: 0.06 },
      effects: { nzbond: 0.02, kiwisaver: 0.015 }
    },
    {
      id: 'dairy-slump',
      headline: 'Dairy prices fall sharply at the global auction',
      why:
        'Dairy is one of New Zealand’s biggest exports. When the price drops, farmers earn less, they spend less in town, and the whole NZ economy feels it — not just the dairy companies.',
      weight: 8,
      cat: { nz: -0.02 },
      effects: { atm: -0.09, nzx50: -0.015 }
    },
    {
      id: 'dairy-strong',
      headline: 'Dairy auction prices jump on strong demand',
      why: 'Higher export earnings flow through the NZ economy, from farm suppliers to small-town businesses.',
      weight: 8,
      cat: { nz: 0.018 },
      effects: { atm: 0.1, nzx50: 0.014 }
    },
    {
      id: 'china-weak',
      headline: 'Chinese demand for NZ exports weakens',
      why:
        'China is New Zealand’s largest trading partner. When Chinese shoppers buy less formula, meat and wool, NZ companies that sell there earn less — which is the risk of depending heavily on one customer.',
      weight: 7,
      cat: { nz: -0.03 },
      effects: { atm: -0.14, air: -0.05 }
    },
    {
      id: 'tourism-record',
      headline: 'Visitor numbers hit a record high',
      why: 'More tourists means fuller planes, busier hotels and more spending across the country.',
      weight: 7,
      cat: { nz: 0.02 },
      effects: { air: 0.13 }
    },
    {
      id: 'oil-spike',
      headline: 'Oil price spikes after supply disruption',
      why:
        'Jet fuel is one of an airline’s largest costs, so airlines are hit hardest. Freight companies pay more for diesel too. Almost everyone else just pays more at the pump.',
      weight: 7,
      cat: { nz: -0.01 },
      effects: { air: -0.12, mft: -0.05 }
    },
    {
      id: 'dry-year',
      headline: 'Dry winter leaves South Island hydro lakes low',
      why:
        'Most NZ electricity comes from water stored in lakes. A dry year means less generation and expensive imported power, which squeezes electricity companies.',
      weight: 6,
      effects: { mel: -0.11, nzx50: -0.01 }
    },
    {
      id: 'fph-approval',
      headline: 'Fisher & Paykel Healthcare wins a major hospital contract',
      why:
        'A single contract can move one company sharply while the rest of the market does not budge. That is company-specific risk — the thing an index fund spreads out and a single share does not.',
      weight: 7,
      effects: { fph: 0.13 }
    },
    {
      id: 'fph-recall',
      headline: 'Fisher & Paykel Healthcare recalls a product line',
      why:
        'Bad company news falls on that company alone. If you owned only this share you would feel all of it; inside a fund you would barely notice.',
      weight: 6,
      effects: { fph: -0.14 }
    },
    {
      id: 'xero-beat',
      headline: 'Xero signs up subscribers faster than forecast',
      why:
        'Software companies are valued on how fast they are growing. Beat the forecast and the price jumps, because investors extend that growth years into the future.',
      weight: 7,
      effects: { xro: 0.16 }
    },
    {
      id: 'xero-miss',
      headline: 'Xero growth slows and the share price drops',
      why:
        'When a company is priced for fast growth, merely growing slower is enough to knock a fifth off it. Nothing went wrong exactly — the future just got re-priced.',
      weight: 7,
      effects: { xro: -0.19 }
    },
    {
      id: 'ai-boom',
      headline: 'AI spending surge lifts chipmakers',
      why:
        'When every large company rushes to buy the same thing at once, whoever sells it earns enormous amounts very quickly. Booms like this are real — and they are also how bubbles start.',
      weight: 8,
      cat: { world: 0.03 },
      effects: { nvda: 0.21, sp500: 0.02 }
    },
    {
      id: 'ai-doubt',
      headline: 'Investors question whether AI spending will pay off',
      why:
        'Prices reflect expectations, not just current profits. Nvidia still sold the same chips this month — what changed is how confident people are about next year.',
      weight: 8,
      cat: { world: -0.025 },
      effects: { nvda: -0.22, sp500: -0.02 }
    },
    {
      id: 'apple-launch',
      headline: 'Apple’s new product sells better than expected',
      why: 'Strong sales lift profits, and a company this large drags the whole US index up with it.',
      weight: 6,
      effects: { aapl: 0.09, sp500: 0.012 }
    },
    {
      id: 'tesla-miss',
      headline: 'Tesla delivers fewer cars than promised',
      why:
        'Tesla’s price rests heavily on belief about the future. Miss a target and some of that belief evaporates immediately.',
      weight: 7,
      effects: { tsla: -0.18 }
    },
    {
      id: 'tesla-beat',
      headline: 'Tesla beats delivery targets',
      why: 'Beating expectations restores confidence, and this share moves violently in both directions.',
      weight: 6,
      effects: { tsla: 0.19 }
    },
    {
      id: 'crypto-etf',
      headline: 'Regulator approves a major crypto fund',
      why:
        'Easier access means more buyers. Crypto has no profits or dividends underneath it, so its price is driven almost entirely by how many people want in.',
      weight: 6,
      cat: { crypto: 0.24 }
    },
    {
      id: 'crypto-collapse',
      headline: 'Large crypto exchange collapses overnight',
      why:
        'There is no government guarantee and no company to sue. When a crypto exchange fails, people who kept coins there can lose everything, and the price of everything crypto falls with it.',
      weight: 6,
      big: true,
      cat: { crypto: -0.32 }
    },
    {
      id: 'nz-recession',
      headline: 'New Zealand enters recession',
      why:
        'A recession means the economy shrank two quarters running. NZ companies feel it most; overseas ones barely notice. This is why holding only NZ shares is riskier than it looks.',
      weight: 5,
      big: true,
      cat: { nz: -0.11 },
      effects: { nzx50: -0.06, nzbond: 0.03, air: -0.06 }
    },
    {
      id: 'global-recession',
      headline: 'Major economies slide into recession',
      why:
        'In a real downturn almost everything risky falls together, and government bonds usually rise as people run for safety. This is the moment diversification either earns its keep or does not.',
      weight: 4,
      big: true,
      cat: { funds: -0.12, nz: -0.13, world: -0.15, crypto: -0.25 },
      effects: { nzbond: 0.04, kiwisaver: -0.05 }
    },
    {
      id: 'recovery',
      headline: 'Economy rebounds faster than expected',
      why:
        'Recoveries lift the riskiest things the most — which is exactly why selling during a crash hurts twice: you take the fall, then miss the bounce.',
      weight: 5,
      big: true,
      cat: { funds: 0.08, nz: 0.09, world: 0.1, crypto: 0.18 },
      effects: { nzbond: -0.01, kiwisaver: 0.04 }
    },
    {
      id: 'bank-stress',
      headline: 'Banking sector under stress',
      why: 'Banks lend to everyone else, so trouble there spreads to every other business quickly.',
      weight: 5,
      cat: { funds: -0.07, nz: -0.07, world: -0.08, crypto: -0.12 },
      effects: { nzbond: 0.025 }
    },
    {
      id: 'inflation-hot',
      headline: 'Inflation comes in higher than forecast',
      why:
        'Prices rising faster means your money buys less, and it makes an OCR hike more likely. Both are bad for shares, and worse for bonds already locked in at lower rates.',
      weight: 8,
      cat: { funds: -0.025, nz: -0.03, world: -0.025, crypto: -0.04 },
      effects: { nzbond: -0.025 }
    },
    {
      id: 'jobs-strong',
      headline: 'Employment figures beat expectations',
      why: 'More people in work means more spending, which usually means higher company profits.',
      weight: 9,
      cat: { funds: 0.02, nz: 0.022, world: 0.02 }
    }
  ];

  const EVENT_CHANCE_PER_MONTH = 0.32;
  const BASE_INFLATION = 0.025;

  function byId(id) {
    for (let i = 0; i < ASSETS.length; i++) {
      if (ASSETS[i].id === id) return ASSETS[i];
    }
    return null;
  }

  function categoryById(id) {
    for (let i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  /* Combined shock an event applies to one asset: the category-wide part and the
   * asset-specific part compound rather than add, so a global crash plus a
   * company disaster lands as one coherent fall instead of double-counting. */
  function effectFor(event, asset) {
    const catPart = event.cat && typeof event.cat[asset.category] === 'number' ? event.cat[asset.category] : 0;
    const ownPart = event.effects && typeof event.effects[asset.id] === 'number' ? event.effects[asset.id] : 0;
    if (catPart === 0 && ownPart === 0) return 0;
    return (1 + catPart) * (1 + ownPart) - 1;
  }

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
   * Percentage shocks don't cancel: a -32% crash followed by a +24% rally leaves
   * you down 16%, not down 8%. Left uncorrected that asymmetry quietly pushes
   * every asset's long-run return below its stated figure — worst for crypto,
   * which has the biggest headlines. Subtracting this from the drift lets events
   * add drama without secretly rewriting the risk/return table students are
   * being asked to reason about. */
  function eventLogDrag(asset) {
    const total = totalEventWeight();
    let sum = 0;
    EVENTS.forEach(function (e) {
      const effect = effectFor(e, asset);
      if (effect !== 0) sum += (e.weight / total) * Math.log(1 + effect);
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
      drag[a.id] = eventLogDrag(a);
    });

    for (let m = 1; m <= months; m++) {
      // Two shared factors: one global, one local to New Zealand.
      const worldShock = rng.normal();
      const nzShock = rng.normal();

      let event = null;
      if (rng.next() < EVENT_CHANCE_PER_MONTH) event = chooseEvent(rng);
      events.push(event);

      ASSETS.forEach(function (a) {
        const own = rng.normal();
        const systematic = a.rhoW * a.rhoW + a.rhoNz * a.rhoNz;
        const idiosyncratic = Math.sqrt(Math.max(0, 1 - systematic));
        const z = a.rhoW * worldShock + a.rhoNz * nzShock + idiosyncratic * own;

        /* `mu` is the compound growth rate a typical path actually achieves.
         *
         * Two things have to be right for that to be true. First, the textbook
         * `mu - sigma^2/2` is not used: that would make `mu` the *arithmetic*
         * mean, and volatility drag would pull the typical outcome far below it
         * — at Ethereum's 85% volatility that alone costs 36 points a year,
         * teaching students that crypto is a certain loss rather than a wide
         * spread of outcomes.
         *
         * Second, the drift is `log(1 + mu)` rather than `mu`, because drift
         * accumulates in log space: feeding in 0.08 directly would compound to
         * exp(0.08) - 1 = 8.33%, so a table promising 8% would quietly deliver
         * a third of a point more. Small, but the whole point of showing an
         * expected return next to a past one is that the numbers are honest. */
        const drift = Math.log(1 + a.mu) * DT - drag[a.id];
        const diffusion = a.sigma * Math.sqrt(DT) * z;
        let r = Math.exp(drift + diffusion) - 1;

        if (event) {
          const shock = effectFor(event, a);
          if (shock !== 0) r = (1 + r) * (1 + shock) - 1;
        }

        const prev = prices[a.id][m - 1];
        // Floored so a catastrophic run can never produce a non-positive price
        // and break the share math downstream.
        const next = Math.max(prev * 0.0001, prev * (1 + r));
        prices[a.id].push(next);
        returns[a.id].push(next / prev - 1);
      });

      const infl = BASE_INFLATION / MONTHS_PER_YEAR + (rng.normal() * 0.004) / Math.sqrt(12);
      cpi.push(cpi[m - 1] * (1 + Math.max(-0.01, infl)));
    }

    return {
      seed: seedText,
      months: months,
      prices: prices,
      returns: returns,
      events: events,
      cpi: cpi
    };
  }

  global.Market = {
    ASSETS: ASSETS,
    CATEGORIES: CATEGORIES,
    EVENTS: EVENTS,
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    BASE_INFLATION: BASE_INFLATION,
    BENCHMARK_ID: BENCHMARK_ID,
    generate: generate,
    byId: byId,
    categoryById: categoryById,
    assetsInCategory: function (categoryId) {
      return ASSETS.filter(function (a) {
        return a.category === categoryId;
      });
    }
  };
})(window);
