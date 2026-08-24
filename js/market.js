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
      start: 3.03,
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
      start: 3.15,
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
      start: 23.0,
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
      start: 5.31,
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
      start: 41.7,
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
      start: 69.33,
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
      start: 76.56,
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
      start: 5.61,
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
      start: 8.25,
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
      start: 0.425,
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
      start: 313.33,
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
      start: 223.96,
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
      start: 328.58,
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
      start: 64738,
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
      start: 1913,
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
,
    {
      id: 'msft',
      name: 'Microsoft',
      ticker: 'MSFT',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 487.31,
      past: { ret: 0.2528, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.228,
      cyclical: 0.9,
      dividend: 0.0075,
      rhoW: 0.41,
      rhoNz: 0.34,
      risk: 3,
      what: 'Makes Windows, Office, and a huge cloud computing business.',
      blurb:
        'One of the largest companies in the world by value. Software and cloud computing rarely go out of fashion, but a company this size can\'t grow forever at the same pace.'
    },
    {
      id: 'googl',
      name: 'Alphabet',
      ticker: 'GOOGL',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 348.06,
      past: { ret: 0.242, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.269,
      cyclical: 0.9,
      dividend: 0.0024,
      rhoW: 0.52,
      rhoNz: 0.37,
      risk: 3,
      what: 'Runs Google Search, YouTube, and Android.',
      blurb:
        'Most of its money comes from ads next to search results. A single antitrust ruling can move the price more than a quarter of earnings.'
    },
    {
      id: 'amzn',
      name: 'Amazon',
      ticker: 'AMZN',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 262.07,
      past: { ret: 0.2013, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.312,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.5,
      rhoNz: 0.37,
      risk: 4,
      what: 'The online store, plus a huge cloud computing arm (AWS).',
      blurb:
        'Retail runs on thin margins; the cloud business is where most of the profit actually comes from.'
    },
    {
      id: 'meta',
      name: 'Meta Platforms',
      ticker: 'META',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 559.02,
      past: { ret: 0.1596, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.357,
      cyclical: 1.1,
      dividend: 0.0038,
      rhoW: 0.41,
      rhoNz: 0.34,
      risk: 4,
      what: 'Owns Facebook, Instagram, and WhatsApp.',
      blurb:
        'Almost all of its revenue is advertising. Big bets on VR/AR headsets have cost billions with no clear payoff yet.'
    },
    {
      id: 'brkb',
      name: 'Berkshire Hathaway',
      ticker: 'BRK-B',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 504.32,
      past: { ret: 0.1332, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.181,
      cyclical: 0.9,
      dividend: 0.0,
      rhoW: 0.35,
      rhoNz: 0.34,
      risk: 3,
      what: 'Warren Buffett\'s holding company — owns big stakes in dozens of businesses.',
      blurb:
        'Not one company but a collection of them, from insurance to railroads to Apple shares. Famously boring on purpose.'
    },
    {
      id: 'avgo',
      name: 'Broadcom',
      ticker: 'AVGO',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 358.76,
      past: { ret: 0.3906, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.343,
      cyclical: 1.1,
      dividend: 0.0071,
      rhoW: 0.43,
      rhoNz: 0.36,
      risk: 4,
      what: 'Makes chips used in phones, networking gear, and AI data centres.',
      blurb:
        'Rode the AI infrastructure boom hard — a company whose fortunes are tied closely to how much money other companies spend on data centres.'
    },
    {
      id: 'lly',
      name: 'Eli Lilly',
      ticker: 'LLY',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 1246.93,
      past: { ret: 0.3364, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.286,
      cyclical: 0.9,
      dividend: 0.0054,
      rhoW: 0.07,
      rhoNz: 0.01,
      risk: 3,
      what: 'A pharmaceutical company, currently best known for weight-loss drugs.',
      blurb:
        'One drug category (GLP-1 medications) has driven a huge share of recent growth — a reminder that even giant companies can be surprisingly dependent on one product line.'
    },
    {
      id: 'jpm',
      name: 'JPMorgan Chase',
      ticker: 'JPM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 356.39,
      past: { ret: 0.2141, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.243,
      cyclical: 0.9,
      dividend: 0.0168,
      rhoW: 0.52,
      rhoNz: 0.44,
      risk: 3,
      what: 'The largest bank in the United States by assets.',
      blurb:
        'Banks make money on the gap between what they pay savers and charge borrowers, so they\'re sensitive to interest rates and the health of the economy.'
    },
    {
      id: 'wmt',
      name: 'Walmart',
      ticker: 'WMT',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 106.49,
      past: { ret: 0.18, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.192,
      cyclical: 0.9,
      dividend: 0.0092,
      rhoW: 0.27,
      rhoNz: 0.18,
      risk: 3,
      what: 'The world\'s largest retailer by revenue.',
      blurb:
        'Thin margins, enormous scale. Tends to hold up better than most retailers when people are cutting back on spending.'
    },
    {
      id: 'v',
      name: 'Visa',
      ticker: 'V',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 382.41,
      past: { ret: 0.1737, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.2,
      cyclical: 0.9,
      dividend: 0.007,
      rhoW: 0.52,
      rhoNz: 0.43,
      risk: 3,
      what: 'Runs the Visa payment network — not a bank, just the plumbing behind card payments.',
      blurb:
        'Takes a small cut of an enormous number of transactions worldwide. Growth tracks how much of the world\'s spending moves onto cards.'
    },
    {
      id: 'xom',
      name: 'ExxonMobil',
      ticker: 'XOM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 164.05,
      past: { ret: 0.1122, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.285,
      cyclical: 0.9,
      dividend: 0.0251,
      rhoW: 0.26,
      rhoNz: 0.22,
      risk: 3,
      what: 'One of the world\'s largest oil and gas companies.',
      blurb:
        'Profits swing hard with the oil price, which nobody — including this simulation — can predict.'
    },
    {
      id: 'unh',
      name: 'UnitedHealth Group',
      ticker: 'UNH',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 398.76,
      past: { ret: 0.1283, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.289,
      cyclical: 0.9,
      dividend: 0.0224,
      rhoW: 0.25,
      rhoNz: 0.22,
      risk: 3,
      what: 'The largest health insurer in the United States.',
      blurb:
        'US healthcare policy and regulation can move this stock more than almost anything the company itself does.'
    },
    {
      id: 'orcl',
      name: 'Oracle',
      ticker: 'ORCL',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 142.45,
      past: { ret: 0.1546, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.354,
      cyclical: 1.1,
      dividend: 0.014,
      rhoW: 0.39,
      rhoNz: 0.28,
      risk: 4,
      what: 'A database and business-software company, now also renting out cloud computing.',
      blurb:
        'An old-guard tech company that\'s spent big trying to compete with the newer cloud giants.'
    },
    {
      id: 'ma',
      name: 'Mastercard',
      ticker: 'MA',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 599.86,
      past: { ret: 0.2012, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.223,
      cyclical: 0.9,
      dividend: 0.0056,
      rhoW: 0.51,
      rhoNz: 0.44,
      risk: 3,
      what: 'Runs the Mastercard payment network.',
      blurb:
        'Visa\'s closest rival — the same \'toll booth on card payments\' business model.'
    },
    {
      id: 'hd',
      name: 'Home Depot',
      ticker: 'HD',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 337.43,
      past: { ret: 0.1276, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.229,
      cyclical: 0.9,
      dividend: 0.0274,
      rhoW: 0.55,
      rhoNz: 0.51,
      risk: 3,
      what: 'The largest home-improvement retailer in the US.',
      blurb:
        'Sales track the housing market closely — more renovations when people are moving house or fixing up what they\'ve got.'
    },
    {
      id: 'pg',
      name: 'Procter & Gamble',
      ticker: 'PG',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 146.6,
      past: { ret: 0.0793, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.17,
      cyclical: 0.9,
      dividend: 0.0293,
      rhoW: 0.16,
      rhoNz: 0.27,
      risk: 3,
      what: 'Makes everyday household brands — Pampers, Gillette, Tide, and more.',
      blurb:
        'People buy this stuff in good times and bad, which is why it\'s considered a defensive stock despite being a regular company, not a bond.'
    },
    {
      id: 'cost',
      name: 'Costco',
      ticker: 'COST',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 971.4,
      past: { ret: 0.2239, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.208,
      cyclical: 0.9,
      dividend: 0.0057,
      rhoW: 0.34,
      rhoNz: 0.3,
      risk: 3,
      what: 'A membership-only warehouse retailer.',
      blurb:
        'Makes much of its actual profit from membership fees, not the groceries — an unusual business model for a retailer.'
    },
    {
      id: 'jnj',
      name: 'Johnson & Johnson',
      ticker: 'JNJ',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 273.04,
      past: { ret: 0.1168, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.173,
      cyclical: 0.9,
      dividend: 0.0144,
      rhoW: 0.29,
      rhoNz: 0.28,
      risk: 3,
      what: 'A healthcare giant spanning medicines, medical devices, and consumer health products.',
      blurb:
        'Faced years of lawsuits over talc products — a reminder that legal risk can hang over even the steadiest-looking companies.'
    },
    {
      id: 'nflx',
      name: 'Netflix',
      ticker: 'NFLX',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 80.01,
      past: { ret: 0.233, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.402,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.26,
      rhoNz: 0.2,
      risk: 4,
      what: 'The largest video streaming service.',
      blurb:
        'Went from cheap disruptor to expensive incumbent as competitors (Disney+, Prime Video, and others) piled into streaming.'
    },
    {
      id: 'bac',
      name: 'Bank of America',
      ticker: 'BAC',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 62.33,
      past: { ret: 0.1735, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.286,
      cyclical: 0.9,
      dividend: 0.018,
      rhoW: 0.54,
      rhoNz: 0.45,
      risk: 3,
      what: 'The second-largest US bank by assets.',
      blurb:
        'Like any bank, its profits move with interest rates and how many loans go bad in a downturn.'
    },
    {
      id: 'abbv',
      name: 'AbbVie',
      ticker: 'ABBV',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 264.52,
      past: { ret: 0.2025, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.257,
      cyclical: 0.9,
      dividend: 0.0258,
      rhoW: 0.21,
      rhoNz: 0.27,
      risk: 3,
      what: 'A pharmaceutical company built around a small number of blockbuster drugs.',
      blurb:
        'Heavily dependent on Humira, one of the best-selling drugs ever — and on finding what replaces it as patents expire.'
    },
    {
      id: 'crm',
      name: 'Salesforce',
      ticker: 'CRM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 209.06,
      past: { ret: 0.1154, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.333,
      cyclical: 1.1,
      dividend: 0.0082,
      rhoW: 0.45,
      rhoNz: 0.38,
      risk: 4,
      what: 'Makes Salesforce, the software many companies use to track customers and sales.',
      blurb:
        'A pure software business — no factories, no oil rigs, just code and subscriptions.'
    },
    {
      id: 'ko',
      name: 'Coca-Cola',
      ticker: 'KO',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 91.99,
      past: { ret: 0.1141, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.164,
      cyclical: 0.9,
      dividend: 0.0226,
      rhoW: 0.19,
      rhoNz: 0.32,
      risk: 3,
      what: 'Makes Coca-Cola and a large stable of other drinks brands.',
      blurb:
        'About as close to \'boring and predictable\' as a public company gets, which is exactly why some investors like it.'
    },
    {
      id: 'amd',
      name: 'Advanced Micro Devices',
      ticker: 'AMD',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 456.74,
      past: { ret: 0.5206, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.623,
      cyclical: 1.3,
      dividend: 0.0,
      rhoW: 0.4,
      rhoNz: 0.24,
      risk: 5,
      what: 'Nvidia\'s main rival in computer chips.',
      blurb:
        'Rides the same AI and gaming demand waves as Nvidia, usually a step behind, usually cheaper.'
    },
    {
      id: 'cvx',
      name: 'Chevron',
      ticker: 'CVX',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 203.09,
      past: { ret: 0.1164, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.285,
      cyclical: 0.9,
      dividend: 0.0347,
      rhoW: 0.27,
      rhoNz: 0.27,
      risk: 3,
      what: 'One of the largest oil and gas companies in the US.',
      blurb:
        'Like Exxon, its profits rise and fall with the oil price more than with anything the company controls.'
    },
    {
      id: 'tmus',
      name: 'T-Mobile US',
      ticker: 'TMUS',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 182.62,
      past: { ret: 0.1512, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.214,
      cyclical: 0.9,
      dividend: 0.0168,
      rhoW: 0.2,
      rhoNz: 0.22,
      risk: 3,
      what: 'A major US mobile phone network.',
      blurb:
        'Phone bills are one of the last things people cancel in a downturn, which makes telecoms relatively defensive.'
    },
    {
      id: 'pep',
      name: 'PepsiCo',
      ticker: 'PEP',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 144.67,
      past: { ret: 0.0602, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.162,
      cyclical: 0.9,
      dividend: 0.0397,
      rhoW: 0.32,
      rhoNz: 0.38,
      risk: 3,
      what: 'Makes Pepsi, Gatorade, Doritos, and a wide range of snack and drink brands.',
      blurb:
        'Similar defensive logic to Coca-Cola — people keep buying snacks and soft drinks through a recession.'
    },
    {
      id: 'wfc',
      name: 'Wells Fargo',
      ticker: 'WFC',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 84.72,
      past: { ret: 0.0968, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.291,
      cyclical: 0.9,
      dividend: 0.0218,
      rhoW: 0.44,
      rhoNz: 0.35,
      risk: 3,
      what: 'One of the largest US banks, historically focused on everyday consumer banking.',
      blurb:
        'Spent years under regulatory restrictions after a string of scandals — a reminder that trust, once lost, is expensive to rebuild.'
    },
    {
      id: 'adbe',
      name: 'Adobe',
      ticker: 'ADBE',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 276.27,
      past: { ret: 0.0979, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.322,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.36,
      rhoNz: 0.34,
      risk: 4,
      what: 'Makes Photoshop, Premiere, and other creative software, now sold by subscription.',
      blurb:
        'Its business model shift from one-off software sales to subscriptions transformed how predictable its revenue is.'
    },
    {
      id: 'lin',
      name: 'Linde',
      ticker: 'LIN',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 490.03,
      past: { ret: 0.1691, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.193,
      cyclical: 0.9,
      dividend: 0.0127,
      rhoW: 0.34,
      rhoNz: 0.37,
      risk: 3,
      what: 'The world\'s largest industrial gas company — oxygen, nitrogen, hydrogen, sold to factories and hospitals.',
      blurb:
        'Unglamorous but essential: modern manufacturing and healthcare can\'t run without industrial gases.'
    },
    {
      id: 'mcd',
      name: 'McDonald\'s',
      ticker: 'MCD',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 272.54,
      past: { ret: 0.1155, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.171,
      cyclical: 0.9,
      dividend: 0.027,
      rhoW: 0.36,
      rhoNz: 0.4,
      risk: 3,
      what: 'The world\'s largest fast-food chain by locations.',
      blurb:
        'Most restaurants are run by franchisees, not McDonald\'s itself — the company mostly collects rent and royalties.'
    },
    {
      id: 'csco',
      name: 'Cisco Systems',
      ticker: 'CSCO',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 110.23,
      past: { ret: 0.1668, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.249,
      cyclical: 0.9,
      dividend: 0.0151,
      rhoW: 0.46,
      rhoNz: 0.37,
      risk: 3,
      what: 'Makes the networking hardware that much of the internet runs on.',
      blurb:
        'A dominant player in a market (networking equipment) that\'s grown much more slowly than it did in the 1990s.'
    },
    {
      id: 'acn',
      name: 'Accenture',
      ticker: 'ACN',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 186.53,
      past: { ret: 0.061, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.288,
      cyclical: 0.9,
      dividend: 0.0175,
      rhoW: 0.34,
      rhoNz: 0.43,
      risk: 3,
      what: 'A large consulting and IT services firm.',
      blurb:
        'Gets paid to help other big companies with technology and strategy — its fortunes track corporate spending on both.'
    },
    {
      id: 'tmo',
      name: 'Thermo Fisher Scientific',
      ticker: 'TMO',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 628.74,
      past: { ret: 0.1505, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.239,
      cyclical: 0.9,
      dividend: 0.0029,
      rhoW: 0.32,
      rhoNz: 0.43,
      risk: 3,
      what: 'Makes lab equipment and supplies used in scientific research and manufacturing.',
      blurb:
        'A less well-known name that quietly supplies the tools behind a huge amount of medical and scientific work.'
    },
    {
      id: 'abt',
      name: 'Abbott Laboratories',
      ticker: 'ABT',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 116.67,
      past: { ret: 0.1278, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.211,
      cyclical: 0.9,
      dividend: 0.0213,
      rhoW: 0.23,
      rhoNz: 0.37,
      risk: 3,
      what: 'A healthcare company spanning medical devices, diagnostics, and nutrition products.',
      blurb:
        'Diversified across several parts of healthcare rather than betting on one drug or device.'
    },
    {
      id: 'ibm',
      name: 'IBM',
      ticker: 'IBM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 231.04,
      past: { ret: 0.0872, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.279,
      cyclical: 0.9,
      dividend: 0.0292,
      rhoW: 0.43,
      rhoNz: 0.35,
      risk: 3,
      what: 'One of the oldest technology companies, now focused on enterprise software and consulting.',
      blurb:
        'Spent much of the last two decades trying to reinvent itself as older hardware and services businesses declined.'
    },
    {
      id: 'ge',
      name: 'General Electric',
      ticker: 'GE',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 341.84,
      past: { ret: 0.1032, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.371,
      cyclical: 1.1,
      dividend: 0.0049,
      rhoW: 0.41,
      rhoNz: 0.35,
      risk: 4,
      what: 'An industrial conglomerate now focused mainly on jet engines.',
      blurb:
        'A famous name that shrank dramatically after selling off or spinning out most of its old divisions.'
    },
    {
      id: 'dis',
      name: 'Walt Disney',
      ticker: 'DIS',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 110.61,
      past: { ret: 0.026, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.307,
      cyclical: 1.1,
      dividend: 0.0136,
      rhoW: 0.49,
      rhoNz: 0.51,
      risk: 4,
      what: 'Owns Disney\'s film studios, theme parks, and streaming service.',
      blurb:
        'A rare company where the theme parks (not the movies) have often been the biggest profit driver.'
    },
    {
      id: 'pm',
      name: 'Philip Morris International',
      ticker: 'PM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 191.46,
      past: { ret: 0.1231, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.241,
      cyclical: 0.9,
      dividend: 0.0307,
      rhoW: 0.14,
      rhoNz: 0.18,
      risk: 3,
      what: 'Sells Marlboro and other cigarette brands outside the United States, plus newer \'reduced-risk\' products.',
      blurb:
        'A defensive business built on a product with declining long-term demand and heavy regulation.'
    },
    {
      id: 'now',
      name: 'ServiceNow',
      ticker: 'NOW',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 128.05,
      past: { ret: 0.2325, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.337,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.34,
      rhoNz: 0.37,
      risk: 4,
      what: 'Makes ServiceNow, workflow software big companies use to run their internal operations.',
      blurb:
        'A fast-growing enterprise software business — expensive by traditional measures, priced for continued growth.'
    },
    {
      id: 'intu',
      name: 'Intuit',
      ticker: 'INTU',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 369.92,
      past: { ret: 0.1379, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.295,
      cyclical: 0.9,
      dividend: 0.013,
      rhoW: 0.36,
      rhoNz: 0.36,
      risk: 3,
      what: 'Makes TurboTax, QuickBooks, and Credit Karma.',
      blurb:
        'Its tax software business is famously seasonal — most of the year\'s activity crams into a few months.'
    },
    {
      id: 'txn',
      name: 'Texas Instruments',
      ticker: 'TXN',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 258.94,
      past: { ret: 0.171, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.287,
      cyclical: 0.9,
      dividend: 0.0219,
      rhoW: 0.43,
      rhoNz: 0.4,
      risk: 3,
      what: 'Makes analog chips used in almost every kind of electronics.',
      blurb:
        'Less flashy than AI chipmakers, but its chips go into everything from cars to washing machines.'
    },
    {
      id: 'cat',
      name: 'Caterpillar',
      ticker: 'CAT',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 811.02,
      past: { ret: 0.2753, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.325,
      cyclical: 1.1,
      dividend: 0.0076,
      rhoW: 0.43,
      rhoNz: 0.36,
      risk: 4,
      what: 'Makes construction and mining machinery.',
      blurb:
        'A classic cyclical stock — sales track construction activity and commodity prices around the world.'
    },
    {
      id: 'vz',
      name: 'Verizon',
      ticker: 'VZ',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 50.15,
      past: { ret: 0.0515, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.19,
      cyclical: 0.9,
      dividend: 0.0558,
      rhoW: 0.02,
      rhoNz: 0.03,
      risk: 3,
      what: 'One of the largest US mobile phone networks.',
      blurb:
        'A slow-growing but steady business — heavy debt from network build-outs, but reliable subscription revenue.'
    },
    {
      id: 'qcom',
      name: 'Qualcomm',
      ticker: 'QCOM',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 158.53,
      past: { ret: 0.1167, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.425,
      cyclical: 1.1,
      dividend: 0.0226,
      rhoW: 0.42,
      rhoNz: 0.29,
      risk: 4,
      what: 'Makes the chips inside most non-Apple smartphones.',
      blurb:
        'Earns a licence fee on a huge share of mobile phones sold worldwide, on top of selling its own chips.'
    },
    {
      id: 'amgn',
      name: 'Amgen',
      ticker: 'AMGN',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 443.84,
      past: { ret: 0.1362, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.244,
      cyclical: 0.9,
      dividend: 0.0224,
      rhoW: 0.18,
      rhoNz: 0.21,
      risk: 3,
      what: 'A biotechnology company focused on drugs for cancer, bone disease, and inflammation.',
      blurb:
        'Like most drugmakers, a small number of products account for most of its revenue.'
    },
    {
      id: 'nke',
      name: 'Nike',
      ticker: 'NKE',
      where: 'NYSE/NASDAQ',
      category: 'world',
      generatedColor: true,
      start: 40.75,
      past: { ret: -0.0121, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.287,
      cyclical: 0.9,
      dividend: 0.04,
      rhoW: 0.24,
      rhoNz: 0.42,
      risk: 3,
      what: 'The world\'s largest sportswear brand.',
      blurb:
        'Sensitive to consumer spending and fashion trends — sneakers are an easy thing to cut back on when money\'s tight.'
    },
    {
      id: 'spk',
      name: 'Spark New Zealand',
      ticker: 'SPK',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 2.15,
      past: { ret: 0.0108, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.176,
      cyclical: 0.9,
      dividend: 0.0953,
      rhoW: 0.24,
      rhoNz: 0.33,
      risk: 3,
      what: 'New Zealand\'s largest mobile and broadband provider.',
      blurb:
        'A steady, high-dividend-paying telecom — the kind of company people hold for the dividend, not for growth.'
    },
    {
      id: 'cen',
      name: 'Contact Energy',
      ticker: 'CEN',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 8.84,
      past: { ret: 0.1119, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.171,
      cyclical: 0.9,
      dividend: 0.0452,
      rhoW: 0.32,
      rhoNz: 0.55,
      risk: 3,
      what: 'Generates electricity in New Zealand, mostly from geothermal and hydro.',
      blurb:
        'Power demand barely changes with the economy, which is why utilities are considered defensive.'
    },
    {
      id: 'ift',
      name: 'Infratil',
      ticker: 'IFT',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 14.7,
      past: { ret: 0.2005, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.203,
      cyclical: 0.9,
      dividend: 0.0142,
      rhoW: 0.4,
      rhoNz: 0.59,
      risk: 3,
      what: 'An investment company that owns stakes in infrastructure and other businesses (including a large stake in One NZ).',
      blurb:
        'More of a diversified holding company than a single business — its value depends on how its various investments perform.'
    },
    {
      id: 'aia',
      name: 'Auckland Airport',
      ticker: 'AIA',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 8.55,
      past: { ret: 0.0292, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.22,
      cyclical: 0.9,
      dividend: 0.0158,
      rhoW: 0.42,
      rhoNz: 0.63,
      risk: 3,
      what: 'Owns and operates Auckland Airport.',
      blurb:
        'Revenue depends heavily on how many people are flying, which makes it sensitive to tourism and travel demand.'
    },
    {
      id: 'ebo',
      name: 'EBOS Group',
      ticker: 'EBO',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 22.28,
      past: { ret: 0.0485, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.2,
      cyclical: 0.9,
      dividend: 0.0532,
      rhoW: 0.11,
      rhoNz: 0.3,
      risk: 3,
      what: 'Distributes medicines and other products to pharmacies and healthcare providers across Australasia.',
      blurb:
        'An unglamorous logistics business sitting behind New Zealand\'s healthcare and pharmacy supply chain.'
    },
    {
      id: 'fbu',
      name: 'Fletcher Building',
      ticker: 'FBU',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 3.9,
      past: { ret: -0.0104, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.359,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.37,
      rhoNz: 0.47,
      risk: 4,
      what: 'New Zealand\'s largest building materials and construction company.',
      blurb:
        'Tracks the construction cycle closely — new housing and building activity drive its results up or down.'
    },
    {
      id: 'rym',
      name: 'Ryman Healthcare',
      ticker: 'RYM',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 2.09,
      past: { ret: -0.1262, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.339,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.47,
      rhoNz: 0.66,
      risk: 4,
      what: 'Builds and operates retirement villages and aged care in NZ and Australia.',
      blurb:
        'An ageing population is a long-term tailwind, but the business is capital-intensive and sensitive to interest rates and house prices.'
    },
    {
      id: 'sum',
      name: 'Summerset Group',
      ticker: 'SUM',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 7.66,
      past: { ret: 0.0568, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.278,
      cyclical: 0.9,
      dividend: 0.032,
      rhoW: 0.34,
      rhoNz: 0.65,
      risk: 3,
      what: 'Another major retirement village and aged care operator.',
      blurb:
        'Ryman\'s closest local rival, with a similar exposure to house prices and interest rates.'
    },
    {
      id: 'vct',
      name: 'Vector',
      ticker: 'VCT',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 4.86,
      past: { ret: 0.0897, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.136,
      cyclical: 0.6,
      dividend: 0.0525,
      rhoW: 0.4,
      rhoNz: 0.51,
      risk: 2,
      what: 'Owns and operates New Zealand\'s electricity and gas distribution networks.',
      blurb:
        'A regulated monopoly-style business — steady, predictable revenue, but growth is limited by regulation.'
    },
    {
      id: 'gne',
      name: 'Genesis Energy',
      ticker: 'GNE',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 2.67,
      past: { ret: 0.0861, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.176,
      cyclical: 0.9,
      dividend: 0.0534,
      rhoW: 0.37,
      rhoNz: 0.64,
      risk: 3,
      what: 'Generates and retails electricity and gas in New Zealand.',
      blurb:
        'Like Contact and Mercury, a defensive utility whose revenue barely moves with the wider economy.'
    },
    {
      id: 'pot',
      name: 'Port of Tauranga',
      ticker: 'POT',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 8.1,
      past: { ret: 0.1023, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.175,
      cyclical: 0.9,
      dividend: 0.0219,
      rhoW: 0.34,
      rhoNz: 0.5,
      risk: 3,
      what: 'Operates the Port of Tauranga, New Zealand\'s largest port.',
      blurb:
        'Trade volumes track the broader economy and global shipping demand.'
    },
    {
      id: 'skc',
      name: 'SkyCity Entertainment',
      ticker: 'SKC',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 0.69,
      past: { ret: -0.1496, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.328,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.38,
      rhoNz: 0.49,
      risk: 4,
      what: 'Runs SkyCity\'s casinos and entertainment venues in NZ and Australia.',
      blurb:
        'A discretionary-spending business — gambling and entertainment budgets are among the first things people cut.'
    },
    {
      id: 'kmd',
      name: 'KMD Brands',
      ticker: 'KMD',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 1.74,
      past: { ret: -0.1898, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.428,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.17,
      rhoNz: 0.44,
      risk: 4,
      what: 'Owns outdoor and sports brands including Kathmandu, Rip Curl, and Oboz.',
      blurb:
        'A consumer retail business exposed to fashion trends and discretionary spending, on top of typical retail margins.'
    },
    {
      id: 'skl',
      name: 'Skellerup Holdings',
      ticker: 'SKL',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 7.3,
      past: { ret: 0.2391, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.223,
      cyclical: 0.9,
      dividend: 0.0428,
      rhoW: 0.32,
      rhoNz: 0.48,
      risk: 3,
      what: 'Makes rubber and polymer products for agriculture, industry, and medical use.',
      blurb:
        'A smaller, less well-known manufacturer whose fortunes track farming and industrial activity.'
    },
    {
      id: 'pct',
      name: 'Precinct Properties',
      ticker: 'PCT',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 1.04,
      past: { ret: 0.0244, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.143,
      cyclical: 0.6,
      dividend: 0.0646,
      rhoW: 0.18,
      rhoNz: 0.53,
      risk: 2,
      what: 'Owns and develops commercial office and retail property in NZ.',
      blurb:
        'Property values and rents here move with interest rates and how much office space businesses actually need.'
    },
    {
      id: 'kpg',
      name: 'Kiwi Property Group',
      ticker: 'KPG',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 0.92,
      past: { ret: 0.0029, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.179,
      cyclical: 0.9,
      dividend: 0.0609,
      rhoW: 0.43,
      rhoNz: 0.74,
      risk: 3,
      what: 'Owns retail and mixed-use property across New Zealand.',
      blurb:
        'Like other property trusts, sensitive to interest rates — borrowing costs eat into returns when rates rise.'
    },
    {
      id: 'spg',
      name: 'Stride Property',
      ticker: 'SPG',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 1.13,
      past: { ret: -0.0029, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.219,
      cyclical: 0.9,
      dividend: 0.0705,
      rhoW: 0.37,
      rhoNz: 0.68,
      risk: 3,
      what: 'Owns industrial and office property in New Zealand.',
      blurb:
        'Similar interest-rate sensitivity to other listed property trusts, with a more industrial-property focus.'
    },
    {
      id: 'mcy',
      name: 'Mercury NZ',
      ticker: 'MCY',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 6.77,
      past: { ret: 0.1225, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.183,
      cyclical: 0.9,
      dividend: 0.036,
      rhoW: 0.35,
      rhoNz: 0.55,
      risk: 3,
      what: 'Generates and retails electricity in New Zealand, mostly from geothermal and hydro.',
      blurb:
        'One of several NZ power utilities in this list — all sit in the same defensive, low-volatility corner of the market.'
    },
    {
      id: 'twl',
      name: 'Turners Automotive Group',
      ticker: 'TWL',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 0.14,
      past: { ret: -0.4445, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.56,
      cyclical: 1.3,
      dividend: 0.0,
      rhoW: 0.17,
      rhoNz: 0.22,
      risk: 5,
      what: 'Sells and finances used cars and other vehicles across NZ and Australia.',
      blurb:
        'A retail and lending business rolled into one — car sales and loan demand both move with the economy.'
    },
    {
      id: 'thl',
      name: 'Tourism Holdings',
      ticker: 'THL',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 2.81,
      past: { ret: 0.016, since: 'past 10 years' },
      mu: 0.035,
      sigma: 0.444,
      cyclical: 1.1,
      dividend: 0.0249,
      rhoW: 0.38,
      rhoNz: 0.55,
      risk: 4,
      what: 'Rents motorhomes and campervans, mostly to tourists, across several countries.',
      blurb:
        'About as tied to tourism demand as a company can get — travel disruptions hit it hard and fast.'
    },
    {
      id: 'scl',
      name: 'Scales Corporation',
      ticker: 'SCL',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 6.9,
      past: { ret: 0.1234, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.204,
      cyclical: 0.9,
      dividend: 0.0362,
      rhoW: 0.27,
      rhoNz: 0.39,
      risk: 3,
      what: 'A food and agriculture company spanning horticulture, logistics, and animal proteins.',
      blurb:
        'Agricultural earnings can swing a lot with weather, commodity prices, and export demand.'
    },
    {
      id: 'frw',
      name: 'Freightways',
      ticker: 'FRW',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 13.25,
      past: { ret: 0.1084, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.226,
      cyclical: 0.9,
      dividend: 0.0317,
      rhoW: 0.56,
      rhoNz: 0.71,
      risk: 3,
      what: 'Runs courier and information management businesses across Australasia.',
      blurb:
        'A logistics company whose volumes track how much stuff people and businesses are shipping around.'
    },
    {
      id: 'whs',
      name: 'The Warehouse Group',
      ticker: 'WHS',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 0.68,
      past: { ret: -0.0945, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.304,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.27,
      rhoNz: 0.37,
      risk: 4,
      what: 'Owns The Warehouse, Warehouse Stationery, and Noel Leeming.',
      blurb:
        'A discount retailer — tends to do relatively better than premium retailers when shoppers are being careful with money.'
    },
    {
      id: 'san',
      name: 'Sanford',
      ticker: 'SAN',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 6.97,
      past: { ret: 0.0306, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.202,
      cyclical: 0.9,
      dividend: 0.0171,
      rhoW: 0.3,
      rhoNz: 0.33,
      risk: 3,
      what: 'New Zealand\'s largest fishing and seafood company.',
      blurb:
        'Earnings depend on catch volumes, quota allocations, and global seafood prices — all outside the company\'s control.'
    },
    {
      id: 'oca',
      name: 'Oceania Healthcare',
      ticker: 'OCA',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 0.8,
      past: { ret: 0.0163, since: 'past 10 years' },
      mu: 0.05,
      sigma: 0.341,
      cyclical: 1.1,
      dividend: 0.0,
      rhoW: 0.37,
      rhoNz: 0.61,
      risk: 4,
      what: 'Builds and operates aged care facilities and retirement villages.',
      blurb:
        'A smaller player in the same ageing-population, interest-rate-sensitive space as Ryman and Summerset.'
    },
    {
      id: 'vhp',
      name: 'Vital Healthcare Property Trust',
      ticker: 'VHP',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 1.83,
      past: { ret: 0.021, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.171,
      cyclical: 0.9,
      dividend: 0.0668,
      rhoW: 0.39,
      rhoNz: 0.64,
      risk: 3,
      what: 'Owns hospitals and medical facilities that it leases to healthcare operators.',
      blurb:
        'A property trust with tenants (hospitals, clinics) less likely to skip rent than most, but still interest-rate sensitive.'
    },
    {
      id: 'pfi',
      name: 'Property For Industry',
      ticker: 'PFI',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 2.36,
      past: { ret: 0.0757, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.14,
      cyclical: 0.6,
      dividend: 0.0301,
      rhoW: 0.47,
      rhoNz: 0.72,
      risk: 2,
      what: 'Owns industrial property — warehouses and distribution centres — across New Zealand.',
      blurb:
        'Industrial property has been in high demand as online shopping drives need for warehouse space.'
    },
    {
      id: 'cnu',
      name: 'Chorus',
      ticker: 'CNU',
      where: 'NZX',
      category: 'nz',
      generatedColor: true,
      start: 9.17,
      past: { ret: 0.1398, since: 'past 10 years' },
      mu: 0.06,
      sigma: 0.171,
      cyclical: 0.9,
      dividend: 0.0638,
      rhoW: 0.18,
      rhoNz: 0.29,
      risk: 3,
      what: 'Owns and operates New Zealand\'s fibre broadband network.',
      blurb:
        'A regulated infrastructure monopoly — steady revenue, heavily influenced by government regulation of what it can charge.'
    }
  ];

  /* Per-asset color, for the ~91 assets that don't have a hand-picked
   * --series-* CSS variable (the original 16 keep theirs unchanged - this
   * only applies to entries marked `generatedColor: true`, added when the
   * asset universe expanded past what anyone hand-authors CSS for).
   *
   * Derived from the asset's category hue (matching --cat-* in
   * css/styles.css) plus an offset spread across that category's other
   * generated assets, so a 34-strong 'nz' category doesn't render as one
   * indistinguishable green blob. A getter, not a computed-once string, so
   * it stays correct if the theme is toggled after the page loads - `a.color`
   * is read at draw time (js/charts.js, js/ui.js's resolveColor) exactly
   * like the CSS-variable colors already are. */
  const CATEGORY_HUE = { defensive: 192, funds: 243, nz: 142, world: 333, crypto: 21 };

  (function assignGeneratedColors() {
    const byCategory = {};
    ASSETS.forEach(function (a) {
      if (!a.generatedColor) return;
      (byCategory[a.category] = byCategory[a.category] || []).push(a);
    });
    Object.keys(byCategory).forEach(function (cat) {
      const group = byCategory[cat];
      const hue = CATEGORY_HUE[cat] || 200;
      group.forEach(function (a, i) {
        const t = group.length > 1 ? i / (group.length - 1) : 0.5;
        const hueOffset = (t - 0.5) * 50;
        Object.defineProperty(a, 'color', {
          enumerable: true,
          get: function () {
            const root = typeof document !== 'undefined' ? document.documentElement : null;
            const dark =
              !!root &&
              (root.getAttribute('data-theme') === 'dark' ||
                (!root.hasAttribute('data-theme') &&
                  typeof window !== 'undefined' &&
                  window.matchMedia &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches));
            const light = dark ? Math.round(64 - t * 16) : Math.round(32 + t * 16);
            const sat = dark ? 70 : 58;
            return 'hsl(' + Math.round(hue + hueOffset) + ', ' + sat + '%, ' + light + '%)';
          }
        });
      });
    });
  })();

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
