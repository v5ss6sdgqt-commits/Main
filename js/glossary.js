/* Click-to-explain definitions.
 *
 * Every one of these is written for someone who has never heard the word before
 * and is not yet convinced they care. That means: short, concrete, second
 * person, and wherever possible using the numbers from the student's own run
 * rather than a made-up example. "You have paid $34 in fees across 11 trades"
 * lands; "fees reduce returns" does not.
 *
 * A term appears in the UI as `data-term="fees"` on any element. Clicking it —
 * or reaching it by keyboard — opens the panel. */

(function (global) {
  'use strict';

  function money(n, dp) {
    return UI.money(n, dp);
  }

  function pct(n, dp) {
    return UI.plainPct(n, dp);
  }

  function p(text) {
    return '<p>' + text + '</p>';
  }

  /* A worked example, set apart from the prose because a number students can
   * follow line by line does more work here than another paragraph. */
  function sum(rows) {
    return (
      '<div class="term-sum">' +
      rows
        .map(function (r) {
          return (
            '<div class="term-sum-row' +
            (r.strong ? ' strong' : '') +
            '"><span>' +
            r.k +
            '</span><span>' +
            r.v +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  const TERMS = {
    fees: {
      title: 'Fees',
      hint: 'What you get charged to trade',
      body: function (state) {
        const flat = state.cfg.feeFlat;
        const rate = state.cfg.feeRate;
        const small = 50;
        const smallFee = flat + small * rate;
        return (
          p(
            'Every time you buy or sell, the platform takes a cut. Here that is <strong>' +
              money(flat) +
              ' flat, plus ' +
              pct(rate, 1) +
              ' of the trade</strong> — close to what real NZ investing apps charge.'
          ) +
          p(
            'The flat part is the one that gets beginners. It is the same ' +
              money(flat) +
              ' whether you trade ' +
              money(small) +
              ' or ' +
              money(5000) +
              ', so on small trades it is enormous:'
          ) +
          sum([
            { k: 'You invest', v: money(small) },
            { k: 'Fee', v: money(smallFee, 2) },
            { k: 'That is', v: pct(smallFee / small, 1) + ' gone instantly', strong: true }
          ]) +
          p(
            'Your investment has to gain ' +
              pct(smallFee / small, 1) +
              ' just to break even. Trading ' +
              money(5000) +
              ' at once costs ' +
              pct((flat + 5000 * rate) / 5000, 2) +
              ' — the same fee, spread over a hundred times more money.'
          ) +
          p(
            'So far you have made <strong>' +
              state.tradeCount +
              (state.tradeCount === 1 ? ' trade' : ' trades') +
              '</strong> and paid <strong>' +
              money(state.totalFees, 2) +
              '</strong>. That money is gone no matter what the market does.'
          )
        );
      },
      see: ['benchmark']
    },

    inflation: {
      title: 'Inflation',
      hint: 'Why the same money buys less each year',
      body: function (state) {
        const cpi = state.market.cpi[state.month];
        const risen = cpi - 1;
        const then = 100;
        return (
          p(
            'Inflation means prices go up over time. A pie that costs ' +
              money(5) +
              ' today might cost ' +
              money(6.5) +
              ' in ten years. Your money did not shrink — it just buys less.'
          ) +
          p(
            'In this run prices have risen <strong>' +
              pct(risen) +
              '</strong> since the start. So ' +
              money(then) +
              ' of your money now buys what ' +
              money(then / cpi, 2) +
              ' used to.'
          ) +
          p(
            'This is why leaving everything in a bank account is not actually safe. If your savings earn ' +
              pct(state.cfg.savingsRate) +
              ' and prices rise ' +
              pct(0.025) +
              ', you are quietly going backwards every year even though the balance goes up.'
          ) +
          p(
            'The "worth in today\'s money" tile strips inflation out, so you can see what your pile is <em>really</em> worth.'
          )
        );
      },
      see: ['real-value', 'cash-interest']
    },

    'real-value': {
      title: "Worth in today's money",
      hint: 'Your balance with inflation taken out',
      body: function (state) {
        const total = Portfolio.totalValue(state);
        const real = Portfolio.realValue(state, total);
        return (
          p(
            'Your balance says ' +
              money(total) +
              '. But prices have risen since you started, so those dollars do not stretch as far as they did.'
          ) +
          p(
            'In what money was worth on day one, you actually have <strong>' +
              money(real) +
              '</strong>.'
          ) +
          p(
            'Always check this number. An investment that "went up 3%" in a year when prices rose 4% actually lost you buying power — the gain was an illusion created by the shrinking dollar.'
          )
        );
      },
      see: ['inflation']
    },

    compounding: {
      title: 'Compounding',
      hint: 'Growth that grows on itself',
      body: function () {
        return (
          p(
            'When your money earns a return, that return then earns its own return next year. Growth stacks on top of growth.'
          ) +
          p(money(1000) + ' growing at 8% a year, with nothing added:') +
          sum([
            { k: 'After 1 year', v: money(1080) },
            { k: 'After 10 years', v: money(2159) },
            { k: 'After 30 years', v: money(10063), strong: true }
          ]) +
          p(
            'The first ten years add about ' +
              money(1159) +
              '. The last ten add roughly ' +
              money(5400) +
              ' — from the same 8%, on a much bigger pile.'
          ) +
          p(
            'This is why starting at 15 is worth so much more than starting at 35. Time is doing the heavy lifting, not cleverness.'
          )
        );
      },
      see: ['annual-return']
    },

    diversification: {
      title: 'Diversification',
      hint: 'Not putting it all in one thing',
      body: function () {
        return (
          p(
            'Spreading your money across different things so that no single disaster wipes you out.'
          ) +
          p(
            'If everything you own is a2 Milk and China stops buying infant formula, you lose a lot. If a2 Milk is one of twelve things you own, it stings and you carry on.'
          ) +
          p(
            'The clever part: things here do not all move together. NZ shares follow the NZ economy, US shares follow the US one, and bonds often go <em>up</em> when shares crash. Mixing things that move differently gives you a smoother ride without giving up much return.'
          ) +
          p(
            'It is the closest thing to a free lunch in investing — less risk, roughly the same return, just for not betting on one horse.'
          )
        );
      },
      see: ['correlation', 'index-fund']
    },

    correlation: {
      title: 'Moving together',
      hint: 'Why the mix matters, not just the number of things',
      body: function () {
        return (
          p(
            'Owning ten things is only real diversification if those ten things do not all fall on the same day.'
          ) +
          p(
            'Buying Fisher & Paykel, Mainfreight, Meridian and a2 Milk sounds spread out, but they are all NZ companies riding the same NZ economy. A recession here hits all four at once.'
          ) +
          p(
            'Buying one NZ fund and one world fund is <em>less</em> exciting and <em>more</em> diversified, because those two do not rise and fall in step.'
          ) +
          p(
            'This simulator models that properly: NZ shares share a hidden "NZ economy" factor, so a mix of NZ names is genuinely riskier than it looks on the surface.'
          )
        );
      },
      see: ['diversification']
    },

    volatility: {
      title: 'Volatility',
      hint: 'How wildly the price swings',
      body: function () {
        return (
          p(
            'How much something jumps around. Not whether it goes up or down overall — how bumpy the trip is.'
          ) +
          p(
            'The NZ bond fund moves about 5% a year. Ethereum moves about 85%. Same idea, wildly different rides.'
          ) +
          p(
            'High volatility matters for two reasons. First, you have to actually live through it — a 60% fall is easy to shrug at on a chart and very hard to sit through when it is your money. Second, most people sell at the bottom, which turns a temporary drop into a permanent loss.'
          ) +
          p(
            'Volatility is the one number that carries over from the past reasonably well. Something that has always been wild will probably stay wild.'
          )
        );
      },
      see: ['risk', 'past-performance', 'drawdown']
    },

    risk: {
      title: 'The risk rating',
      hint: 'What the coloured label means',
      body: function () {
        return (
          p(
            'A quick 1-to-5 summary of how bumpy each thing is, based on its volatility.'
          ) +
          sum([
            { k: 'Very low', v: 'Barely moves. Bonds, balanced funds.' },
            { k: 'Low', v: 'Index funds. Real falls, but they recover.' },
            { k: 'Medium', v: 'Solid single companies.' },
            { k: 'High', v: 'Can halve. Xero, a2 Milk, Nvidia.' },
            { k: 'Extreme', v: 'Can lose most of its value. Tesla, crypto.' }
          ]) +
          p(
            'Higher risk does <strong>not</strong> mean higher return. It means a wider spread of possible outcomes — the good ones better, the bad ones much worse.'
          )
        );
      },
      see: ['volatility', 'expected-return']
    },

    'index-fund': {
      title: 'Index fund',
      hint: 'Buying every company at once',
      body: function () {
        return (
          p(
            'Instead of picking which company will do well, you buy a tiny slice of all of them.'
          ) +
          p(
            'The S&P/NZX 50 fund holds the 50 biggest NZ companies. Buy ' +
              money(50) +
              ' of it and you own a sliver of Fisher & Paykel, Mainfreight, Meridian and 47 others.'
          ) +
          p(
            'You will never beat the market this way — you <em>are</em> the market. But you also cannot be wrecked by one company collapsing, and you pay far less in fees than someone trading constantly.'
          ) +
          p(
            'Decades of evidence say most professional investors, paid full-time to pick winners, do worse than this over long periods. That is not a small finding.'
          )
        );
      },
      see: ['benchmark', 'diversification']
    },

    benchmark: {
      title: 'The benchmark',
      hint: 'The "do nothing" strategy you are racing',
      body: function (state) {
        const bench = Portfolio.benchValue(state);
        const you = Portfolio.totalValue(state);
        const diff = you - bench;
        return (
          p(
            'The grey line is an imaginary investor who put every dollar into the Total World Fund on day one, invests every ' +
              money(state.cfg.monthlyContribution) +
              ' the moment it arrives, and then <strong>never does anything again</strong>. No trading, no checking, no news.'
          ) +
          p(
            'It faces the exact same prices and the same crashes as you, so the only difference between the two lines is your decisions.'
          ) +
          sum([
            { k: 'You', v: money(you) },
            { k: 'Doing nothing', v: money(bench) },
            {
              k: 'Difference',
              v: (diff >= 0 ? '+' : '') + money(diff),
              strong: true
            }
          ]) +
          p(
            'One fairness note: the benchmark pays the percentage fee but not the ' +
              money(state.cfg.feeFlat) +
              ' flat fee, because an automatic monthly investment plan does not get charged per trade in real life — KiwiSaver works the same way. Charging it would hand you an unearned head start.'
          )
        );
      },
      see: ['index-fund', 'fees']
    },

    'annual-return': {
      title: 'Growth per year',
      hint: 'Your real rate, not a rough average',
      body: function () {
        return (
          p(
            'The rate your money actually grew at, per year, once the timing of your deposits is accounted for.'
          ) +
          p(
            'The obvious way to work this out is wrong. If you divide your final balance by everything you put in, you treat the ' +
              money(50) +
              ' you deposited last month as though it had been growing for ten years. It had not — it had been there for four weeks.'
          ) +
          p(
            'That mistake makes investing look far worse than it is, sometimes by several percentage points. This app instead solves for the rate that makes all your actual deposit dates add up — the same method used to compare real funds.'
          ) +
          p(
            'A gap of even 1% a year matters enormously over a lifetime. 7% versus 8% on ' +
              money(1000) +
              ' over 40 years is roughly ' +
              money(15000) +
              ' versus ' +
              money(21700) +
              '.'
          )
        );
      },
      see: ['compounding']
    },

    'expected-return': {
      title: 'Expected return',
      hint: 'A best guess, not a promise',
      body: function () {
        return (
          p(
            'The return this simulation assumes something will average over the long run. It is an estimate, not a schedule.'
          ) +
          p(
            'An expected return of 8% does not mean 8% every year. It means a lot of years somewhere between -25% and +35%, which happen to average out near 8% if you wait long enough.'
          ) +
          p(
            'Notice that the individual companies here all have <em>similar</em> expected returns, but wildly different risk. That is deliberate, and it is close to what the evidence actually says: picking a single company does not reliably raise your return, it just widens the range of things that can happen to you.'
          )
        );
      },
      see: ['past-performance', 'risk']
    },

    'past-performance': {
      title: 'Why past returns are not future returns',
      hint: 'The most important idea here',
      body: function () {
        return (
          p(
            'Look at any company in the table and you will see two numbers that disagree. Nvidia returned about 33% a year for twenty years. This simulator expects it to return about 9% from here.'
          ) +
          p('That is not a bug. It is the entire lesson.') +
          p(
            'A share price already reflects what everyone knows about how good the company is. Nvidia being brilliant is not a secret — it is priced in. To make 33% a year again, it would have to keep beating expectations that are already sky-high.'
          ) +
          p(
            'The graveyard is full of "obvious" winners. In 2007 the safest company in NZ looked like a finance firm; dozens of them collapsed. a2 Milk rose about thirty-fold and then fell around 80%. Anyone who bought after reading about the rise caught the fall.'
          ) +
          p(
            'Past <em>volatility</em> does carry over — wild things stay wild. Past <em>returns</em> mostly do not. Chasing last decade\'s winner is the single most common way beginners lose money.'
          )
        );
      },
      see: ['expected-return', 'volatility']
    },

    bonds: {
      title: 'Bonds',
      hint: 'Lending instead of owning',
      body: function () {
        return (
          p(
            'When you buy a share you own a piece of a company. When you buy a bond you have <em>lent</em> money — to a government or a company — and they pay you interest and give it back later.'
          ) +
          p(
            'Lending is safer than owning. You get paid before shareholders do, and a government bond is about as close to a sure thing as exists. In exchange you get less: around 4% a year instead of 8%.'
          ) +
          p(
            'Bonds earn their place by often rising when shares crash, as people run for safety. That is what makes a mix steadier than shares alone.'
          )
        );
      },
      see: ['diversification', 'ocr']
    },

    shares: {
      title: 'Shares',
      hint: 'What you actually own',
      body: function () {
        return (
          p(
            'A share is a small piece of a real company. Own one Mainfreight share and you genuinely own a sliver of the trucks, the warehouses and the profits.'
          ) +
          p(
            'The price moves because people are constantly re-guessing what those future profits are worth. Good news raises the guess, bad news lowers it.'
          ) +
          p(
            'You can own fractions here — a ' +
              money(50) +
              ' purchase of a ' +
              money(178000) +
              ' bitcoin gets you a tiny slice, and the same works for shares. Real NZ platforms let you do this too.'
          )
        );
      },
      see: ['index-fund', 'units']
    },

    units: {
      title: 'Units',
      hint: 'Owning a fraction',
      body: function () {
        return (
          p(
            'How many shares or slices you hold. It is almost never a whole number, and that is fine.'
          ) +
          p(
            'If Mainfreight costs ' +
              money(68) +
              ' and you invest ' +
              money(50) +
              ', you get about 0.74 units. You still get 0.74 units\' worth of every rise and fall.'
          ) +
          p(
            'This is why you can start investing with ' +
              money(50) +
              ' rather than needing enough for a whole bitcoin.'
          )
        );
      },
      see: ['shares']
    },

    crypto: {
      title: 'Crypto',
      hint: 'What is actually underneath it',
      body: function () {
        return (
          p(
            'Bitcoin and Ethereum are not companies. There are no profits, no products being sold, no staff, and nobody legally responsible for the value.'
          ) +
          p(
            'A share is worth something because the company earns money. Crypto is worth exactly what the next person will pay, which is why it can move 30% on a rumour.'
          ) +
          p(
            'It has fallen more than 70% four separate times and recovered each time so far. "So far" is the important part — a recovery is not a rule.'
          ) +
          p(
            'It is included here because it is real, plenty of people your age own it, and pretending otherwise would be silly. Just be honest with yourself that you are betting on demand, not on a business.'
          )
        );
      },
      see: ['volatility', 'risk']
    },

    kiwisaver: {
      title: 'KiwiSaver',
      hint: 'The one you will actually have',
      body: function () {
        return (
          p(
            'A government-backed savings scheme almost every working New Zealander is in. Money comes out of your pay, your employer adds some, and the government chips in a bit each year.'
          ) +
          p(
            'You cannot touch it until 65, with two exceptions: buying your first home, and serious hardship. That lock is the point — it stops you panic-selling in a crash.'
          ) +
          p(
            'Your KiwiSaver is invested in a fund much like the balanced fund here. The fund you pick matters enormously over 45 years: a "conservative" fund feels safer and will very likely leave you with far less at 65 than a growth fund would have.'
          ) +
          p(
            'When you get your first job, this is the single most valuable financial decision you will make — and most people never make it at all, just taking whatever default they are put in.'
          )
        );
      },
      see: ['compounding', 'index-fund']
    },

    'cash-interest': {
      title: 'Interest on cash',
      hint: 'What idle money earns',
      body: function (state) {
        return (
          p(
            'Money you have not invested sits as cash and earns ' +
              pct(state.cfg.savingsRate) +
              ' a year, like a savings account.'
          ) +
          p(
            'That sounds fine until you compare it to inflation at about ' +
              pct(0.025) +
              '. Your balance grows and your buying power shrinks at the same time.'
          ) +
          p(
            'Cash is genuinely useful for money you need soon — next year\'s laptop, an emergency. It is a poor place for money you will not touch for thirty years.'
          )
        );
      },
      see: ['inflation']
    },

    'dollar-cost-averaging': {
      title: 'Investing a bit each month',
      hint: 'Why the monthly deposit helps',
      body: function (state) {
        return (
          p(
            'You add ' +
              money(state.cfg.monthlyContribution) +
              ' every month, no matter what the market is doing. That is the same habit as money going into KiwiSaver from every payslip.'
          ) +
          p(
            'It quietly does something clever: the same ' +
              money(state.cfg.monthlyContribution) +
              ' buys more units when prices are low and fewer when prices are high. You automatically buy more of the crash.'
          ) +
          p(
            'It also removes the hardest question in investing — "is now a good time?" — which almost nobody answers correctly, including professionals.'
          )
        );
      },
      see: ['compounding', 'benchmark']
    },

    drawdown: {
      title: 'Worst fall',
      hint: 'The deepest hole along the way',
      body: function () {
        return (
          p(
            'The largest drop from a high point to a low point during the run. It tells you what you had to sit through, which the final number completely hides.'
          ) +
          p(
            'Two portfolios can both finish at ' +
              money(15000) +
              ' when one dipped 10% and the other fell 55% on the way. They are not the same investment, and you are not the same person at the bottom of each.'
          ) +
          p(
            'This is the number to look at when deciding how much risk you can actually handle — not how much you would <em>like</em> to handle.'
          )
        );
      },
      see: ['volatility']
    },

    ocr: {
      title: 'The OCR',
      hint: 'The lever the Reserve Bank pulls',
      body: function () {
        return (
          p(
            'The Official Cash Rate is the interest rate the Reserve Bank of New Zealand sets. Nearly every other rate — mortgages, savings, business loans — follows it.'
          ) +
          p(
            'Raise it and borrowing gets dearer, people spend less, and inflation cools. It also makes shares less attractive: why take the risk if a bank deposit pays well?'
          ) +
          p(
            'Cut it and the opposite happens, which is why share prices usually jump on a cut. When you hear the OCR mentioned on the news, this is what is being decided.'
          )
        );
      },
      see: ['inflation', 'bonds']
    },

    currency: {
      title: 'The exchange rate',
      hint: 'A real risk this app leaves out',
      body: function () {
        return (
          p(
            'All prices here are in NZ dollars, including the overseas ones. In real life, owning US shares means you are also holding US dollars.'
          ) +
          p(
            'So your Apple shares can rise 10% in America while the NZ dollar strengthens 10%, and you end up with nothing. It works pleasantly in reverse too.'
          ) +
          p(
            '<strong>This simulator does not model that.</strong> It is a genuine simplification, and worth knowing about before you invest overseas for real.'
          )
        );
      },
      see: ['diversification']
    },

    seed: {
      title: 'Market seed',
      hint: 'Why everyone can get the same market',
      body: function (state) {
        return (
          p(
            'The seed is the starting point for every random number in the simulation. Type the same seed and you get exactly the same ' +
              state.market.months / 12 +
              ' years — the same crash in the same month, the same headlines.'
          ) +
          p(
            'That is what makes comparing worthwhile. If the whole class runs seed "' +
              state.market.seed +
              '", then whoever finishes ahead genuinely made better decisions, rather than just getting a kinder market.'
          ) +
          p(
            'Change the seed and run the same strategy again to see the opposite point: how much of any single result was simply luck.'
          )
        );
      }
    }
  };

  /* ---------------- the panel ---------------- */

  let panel = null;
  let lastAnchor = null;
  let getState = null;

  function build() {
    panel = document.createElement('div');
    panel.className = 'term-pop';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'term-pop-title');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="term-head">' +
      '<h3 id="term-pop-title"></h3>' +
      '<button type="button" class="term-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="term-body"></div>' +
      '<div class="term-see"></div>';
    document.body.appendChild(panel);

    panel.querySelector('.term-close').addEventListener('click', close);
    panel.addEventListener('click', function (ev) {
      const link = ev.target.closest('[data-goto]');
      if (link) open(link.getAttribute('data-goto'), lastAnchor);
    });
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const anchor = lastAnchor;
    lastAnchor = null;
    // Send focus back where it came from, or the panel becomes a keyboard trap.
    if (anchor && document.contains(anchor)) anchor.focus();
  }

  function place(anchor) {
    /* On a phone the panel is a bottom sheet pinned by CSS, so there is nothing
     * to position — measuring here would fight the stylesheet. */
    if (window.matchMedia('(max-width: 620px)').matches) {
      panel.style.left = '';
      panel.style.top = '';
      return;
    }

    const box = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 10;

    let left = box.left + window.scrollX;
    if (left + width > window.scrollX + document.documentElement.clientWidth - margin) {
      left = window.scrollX + document.documentElement.clientWidth - width - margin;
    }

    // Prefer below; flip above when there is no room and more space up top.
    let top = box.bottom + window.scrollY + 8;
    const spaceBelow = window.innerHeight - box.bottom;
    if (spaceBelow < height + margin && box.top > spaceBelow) {
      top = box.top + window.scrollY - height - 8;
    }

    panel.style.left = Math.max(margin, left) + 'px';
    panel.style.top = Math.max(margin, top) + 'px';
  }

  function open(termId, anchor) {
    const term = TERMS[termId];
    if (!term) return;
    if (!panel) build();

    const state = getState && getState();
    if (!state) return;

    panel.querySelector('#term-pop-title').textContent = term.title;
    panel.querySelector('.term-body').innerHTML =
      typeof term.body === 'function' ? term.body(state) : term.body;

    const see = panel.querySelector('.term-see');
    if (term.see && term.see.length) {
      see.innerHTML =
        '<span class="term-see-label">See also</span>' +
        term.see
          .map(function (id) {
            return TERMS[id]
              ? '<button type="button" class="term-chip" data-goto="' + id + '">' + TERMS[id].title + '</button>'
              : '';
          })
          .join('');
      see.hidden = false;
    } else {
      see.innerHTML = '';
      see.hidden = true;
    }

    lastAnchor = anchor || lastAnchor;
    panel.hidden = false;
    place(lastAnchor);
    panel.querySelector('.term-close').focus();
  }

  /* One delegated listener on the document, so terms rendered later — market
   * rows, results tiles — work without being re-wired every render. */
  function attach(stateGetter) {
    getState = stateGetter;
    if (!panel) build();

    document.addEventListener('click', function (ev) {
      const trigger = ev.target.closest('[data-term]');
      if (trigger) {
        ev.preventDefault();
        open(trigger.getAttribute('data-term'), trigger);
        return;
      }
      if (!panel.hidden && !ev.target.closest('.term-pop')) close();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') close();
    });

    window.addEventListener('resize', function () {
      if (!panel.hidden && lastAnchor) place(lastAnchor);
    });

    // A scrolled-away panel is just clutter, and re-anchoring on scroll is worse.
    window.addEventListener(
      'scroll',
      function () {
        if (!panel.hidden) close();
      },
      { passive: true }
    );
  }

  /* Markup helper: wraps a label in a button that opens its explanation. Used
   * everywhere a term appears so the affordance is identical each time. */
  function tag(termId, label) {
    const term = TERMS[termId];
    const text = label || (term ? term.title : termId);
    return (
      '<button type="button" class="term-link" data-term="' +
      termId +
      '" aria-label="' +
      text +
      ' — what does this mean?">' +
      text +
      '</button>'
    );
  }

  global.Glossary = {
    TERMS: TERMS,
    attach: attach,
    open: open,
    close: close,
    tag: tag
  };
})(window);
