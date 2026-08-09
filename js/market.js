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
      past: { ret: 0.035, since: 'past 11 years' },
      mu: 0.04,
      sigma: 0.025,
      cyclical: -0.25,
      dividend: 0.036,
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
      cyclical: 0.5,
      dividend: 0,
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
      past: { ret: 0.068, since: 'past 19 years' },
      mu: 0.075,
      sigma: 0.116,
      cyclical: 1,
      dividend: 0.037,
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
      past: { ret: 0.149, since: 'past 11 years' },
      mu: 0.08,
      sigma: 0.135,
      cyclical: 1,
      dividend: 0.014,
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
      past: { ret: 0.122, since: 'past 11 years' },
      mu: 0.08,
      sigma: 0.126,
      cyclical: 1,
      dividend: 0.015,
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
      past: { ret: 0.153, since: 'past 20 years' },
      mu: 0.06,
      sigma: 0.244,
      cyclical: 0.8,
      dividend: 0.013,
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
      past: { ret: 0.155, since: 'past 20 years' },
      mu: 0.058,
      sigma: 0.223,
      cyclical: 1.1,
      dividend: 0.025,
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
      where: 'ASX',
      category: 'nz',
      color: 'var(--series-xro)',
      start: 175.0,
      past: { ret: 0.203, since: 'past 14 years' },
      mu: 0.04,
      sigma: 0.428,
      cyclical: 1.2,
      dividend: 0,
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
      past: { ret: 0.165, since: 'since 2013' },
      mu: 0.063,
      sigma: 0.193,
      cyclical: 0.6,
      dividend: 0.038,
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
      past: { ret: 0.266, since: 'past 20 years' },
      mu: 0.035,
      sigma: 0.615,
      cyclical: 0.9,
      /* a2 Milk's real trailing yield is ~7.8%, but that includes a one-off
         NZ$300m special dividend paid July 2026 — not a repeatable annual
         payout. This is the ordinary/recurring dividend only. */
      dividend: 0.028,
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
      past: { ret: 0.027, since: 'past 20 years' },
      mu: 0.03,
      sigma: 0.348,
      cyclical: 1.3,
      dividend: 0.029,
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
      past: { ret: 0.278, since: 'past 20 years' },
      mu: 0.06,
      sigma: 0.297,
      cyclical: 1,
      dividend: 0.003,
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
      past: { ret: 0.364, since: 'past 20 years' },
      mu: 0.04,
      sigma: 0.464,
      cyclical: 1.3,
      dividend: 0.0013,
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
      past: { ret: 0.406, since: 'since 2010' },
      mu: 0.03,
      sigma: 0.623,
      cyclical: 1.4,
      dividend: 0,
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
      past: { ret: 0.554, since: 'since 2014' },
      mu: 0.03,
      sigma: 0.713,
      cyclical: 1.2,
      dividend: 0,
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
      past: { ret: 0.112, since: 'since 2017' },
      mu: 0.025,
      sigma: 0.922,
      cyclical: 1.3,
      dividend: 0,
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
      crash: true,
      cat: { crypto: -0.32 }
    },
    {
      id: 'nz-recession',
      headline: 'New Zealand enters recession',
      why:
        'A recession means the economy shrank two quarters running. NZ companies feel it most; overseas ones barely notice. This is why holding only NZ shares is riskier than it looks.',
      weight: 5,
      big: true,
      crash: true,
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
      crash: true,
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

  /* Strength of the pull back toward each asset's median path, per year. Small
   * on purpose: enough to bound thirty-year tails, too weak to be a forecast. */
  const MEAN_REVERSION = 0.12;

  /* ── The business cycle ──
   *
   * The economy walks a loop: expansion → peak → recession → recovery →
   * expansion. It is the thing high-school economics actually teaches, and
   * wiring it in makes the rest of the app cohere — the news stops being random
   * and starts being *caused*, GDP becomes something to watch, and the market
   * gets the one behaviour a plain random walk cannot produce.
   *
   * That behaviour is `corr`: in a downturn, everything risky starts moving
   * together. Diversification failing exactly when it is needed most is one of
   * the most important facts about real markets, and no amount of tuning
   * individual correlations reproduces it — the regime has to do it.
   *
   * `months` is the average length of each phase, roughly matched to the real
   * post-war record: long expansions, short sharp recessions. */
  const CYCLE = [
    {
      id: 'expansion',
      name: 'Expansion',
      mood: 'good',
      blurb: 'Businesses are hiring, people are spending, and shares grind upwards.',
      teach:
        'The long, boring, profitable part of the cycle. Most years look like this, which is exactly why sitting still tends to win.',
      gdp: 0.032,
      drift: 0.025,
      volMult: 0.9,
      corr: 0.0,
      inflation: 0.025,
      months: 60
    },
    {
      id: 'peak',
      name: 'Overheating',
      mood: 'warm',
      blurb: 'Running hot. Prices are rising fast and the Reserve Bank is getting nervous.',
      teach:
        'Everyone feels rich and nobody wants to sell. Inflation climbs, the OCR goes up to cool things down, and higher rates make shares less attractive.',
      gdp: 0.015,
      drift: 0.0,
      volMult: 1.1,
      corr: 0.1,
      inflation: 0.04,
      months: 10
    },
    {
      id: 'recession',
      name: 'Recession',
      mood: 'bad',
      blurb: 'The economy is shrinking. Jobs go, and almost everything risky falls together.',
      teach:
        'Two quarters of shrinking GDP. This is when diversification is tested: correlations rise, so things that normally move apart fall side by side. Bonds are the exception.',
      gdp: -0.018,
      drift: -0.11,
      volMult: 1.7,
      corr: 0.35,
      inflation: 0.015,
      months: 11
    },
    {
      id: 'recovery',
      name: 'Recovery',
      mood: 'warm',
      blurb: 'The worst is over. Rates are low, and the riskiest things bounce hardest.',
      teach:
        'The bounce usually starts before the news feels better, which is why selling at the bottom hurts twice — you take the fall and miss the rebound.',
      gdp: 0.038,
      drift: 0.075,
      volMult: 1.25,
      corr: 0.15,
      inflation: 0.018,
      months: 18
    }
  ];

  /* Long-run share of time spent in each phase, from the average durations. */
  function cycleWeights() {
    const total = CYCLE.reduce(function (s, c) {
      return s + c.months;
    }, 0);
    return CYCLE.map(function (c) {
      return c.months / total;
    });
  }

  /* The cycle must not quietly change any asset's long-run return.
   *
   * Recessions subtract drift and expansions add it, and those do not cancel by
   * themselves — weighted by how long each phase lasts, the average comes out
   * positive. Subtracting that average keeps `mu` meaning exactly what the table
   * says it means, the same discipline the news events already follow. */
  function cycleDriftBias() {
    const w = cycleWeights();
    return CYCLE.reduce(function (sum, c, i) {
      return sum + w[i] * c.drift;
    }, 0);
  }

  function cycleById(id) {
    for (let i = 0; i < CYCLE.length; i++) {
      if (CYCLE[i].id === id) return CYCLE[i];
    }
    return CYCLE[0];
  }

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

  /* The category an event hits hardest, averaged across its assets. Used to
   * offer a targeted "sell just the crypto" instead of only an all-or-nothing
   * panic button. */
  function worstCategory(event) {
    let worst = null;
    let worstHit = 0;
    CATEGORIES.forEach(function (cat) {
      const assets = ASSETS.filter(function (a) {
        return a.category === cat.id;
      });
      if (!assets.length) return;
      const mean =
        assets.reduce(function (sum, a) {
          return sum + effectFor(event, a);
        }, 0) / assets.length;
      if (mean < worstHit) {
        worstHit = mean;
        worst = cat;
      }
    });
    return worst ? { category: worst, hit: worstHit } : null;
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
   * separately generated path that got luckier or unluckier.
   *
   * `liveStart` is an optional { assetId: price } map — a real price fetched
   * moments ago, standing in for the asset's usual fixed `start`. Anything
   * missing, zero, or not a number just falls back to `start`, so a slow or
   * failed fetch degrades to exactly today's default behaviour rather than
   * breaking the run. */
  function generate(seedText, months, liveStart) {
    const rng = Rng.make(seedText);
    const prices = {};
    const returns = {};
    const startPrice = {};

    ASSETS.forEach(function (a) {
      const live = liveStart && liveStart[a.id];
      startPrice[a.id] = typeof live === 'number' && live > 0 ? live : a.start;
      prices[a.id] = [startPrice[a.id]];
      returns[a.id] = [0];
    });

    const events = [null];
    const cpi = [1];

    const drag = {};
    ASSETS.forEach(function (a) {
      drag[a.id] = eventLogDrag(a);
    });

    /* Cycle state. Starts in expansion, which is where most decades begin. */
    let phase = 0;
    const cycle = [CYCLE[0].id];
    const gdp = [CYCLE[0].gdp];
    const bias = cycleDriftBias();

    for (let m = 1; m <= months; m++) {
      // Advance the cycle first: this month happens inside the new phase.
      const here = CYCLE[phase];
      if (rng.next() < 1 / here.months) phase = (phase + 1) % CYCLE.length;
      const regime = CYCLE[phase];
      cycle.push(regime.id);
      // Reported GDP wobbles around the phase's underlying rate.
      gdp.push(regime.gdp + rng.normal() * 0.008);

      // Two shared factors: one global, one local to New Zealand.
      const worldShock = rng.normal();
      const nzShock = rng.normal();

      let event = null;
      if (rng.next() < EVENT_CHANCE_PER_MONTH) event = chooseEvent(rng);
      events.push(event);

      ASSETS.forEach(function (a) {
        const own = rng.normal();

        /* In a downturn, correlations rise toward one. `corr` pulls each asset's
         * loading on the shared world factor upward, so a diversified holding
         * stops behaving like one exactly when the student needs it to. */
        const rhoW = Math.min(1, a.rhoW + regime.corr * (1 - a.rhoW) * (a.cyclical > 0 ? 1 : 0));
        const systematic = rhoW * rhoW + a.rhoNz * a.rhoNz;
        const idiosyncratic = Math.sqrt(Math.max(0, 1 - systematic));
        const z = rhoW * worldShock + a.rhoNz * nzShock + idiosyncratic * own;

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
        /* Mean reversion, and the reason it is here.
         *
         * Plain geometric Brownian motion has nothing stopping it: the spread of
         * outcomes grows with the square root of time and never bounds. Over
         * thirty years that produced Ethereum at a billion times its starting
         * price in about a third of runs — visibly broken rather than merely
         * unlucky. Real assets cannot do that; nothing compounds past the size of
         * the world economy.
         *
         * So the drift gets a gentle pull back toward the median path. `kappa` is
         * small enough to be almost invisible over ten years and firm enough to
         * stop the thirty-year tails running away. It pulls toward the trend, not
         * toward a fixed price, so the median is untouched. */
        /* `mu` is the *total* return. Once part of it is paid out as cash the
         * price can only be left to deliver the rest, or the two together would
         * double-count and every asset would quietly beat its stated figure. */
        const priceMu = a.mu - (a.dividend || 0);
        const trend = Math.log(1 + priceMu) * (m - 1) * DT;
        // Anchored to the price this run actually started at, not the fixed
        // `a.start` constant — otherwise a live starting price would look
        // permanently "off-trend" and get pulled back toward the old default.
        const gap = Math.log(prices[a.id][m - 1] / startPrice[a.id]) - trend;
        const pull = -MEAN_REVERSION * gap * DT;

        const cyclical = a.cyclical * (regime.drift - bias) * DT;
        const drift = Math.log(1 + priceMu) * DT - drag[a.id] + cyclical + pull;
        const diffusion = a.sigma * regime.volMult * Math.sqrt(DT) * z;
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

      // Inflation follows the cycle: hot at the peak, cool in a recession.
      const infl = regime.inflation / MONTHS_PER_YEAR + (rng.normal() * 0.004) / Math.sqrt(12);
      cpi.push(cpi[m - 1] * (1 + Math.max(-0.01, infl)));
    }

    return {
      seed: seedText,
      months: months,
      prices: prices,
      returns: returns,
      events: events,
      cpi: cpi,
      cycle: cycle,
      gdp: gdp
    };
  }

  global.Market = {
    ASSETS: ASSETS,
    CATEGORIES: CATEGORIES,
    CYCLE: CYCLE,
    cycleById: cycleById,
    worstCategory: worstCategory,
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
