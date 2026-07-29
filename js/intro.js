/* The opening briefing.
 *
 * A student used to land on a dense dashboard — sixteen assets, a goal bar, an
 * economy panel — with no idea what any of it was or where the money came from.
 * The first question anyone asked was "why is my balance going up when I haven't
 * bought anything?", which is the $50 monthly deposit doing exactly what it is
 * supposed to. If the briefing fixes only that, it has earned its place.
 *
 * Four screens, deliberately. A fifteen-year-old will read four short cards and
 * will not read a page. Everything here is skippable, shown once, and reachable
 * again from "How it works" in the header — nobody should have to sit through it
 * on their second run. */

(function (global) {
  'use strict';

  const SEEN_KEY = 'marketlab-intro-seen';

  const CARDS = [
    {
      tag: 'Your money',
      title: 'You have $1,000 and a part-time job',
      body: function (cfg) {
        return (
          '<p>You start with <strong>' +
          UI.money(cfg.startingCash) +
          '</strong> saved up. Every month, <strong>' +
          UI.money(cfg.monthlyContribution) +
          '</strong> lands in your account from your job — automatically, for the whole run.</p>' +
          '<p>Over ten years that is <strong>' +
          UI.money(cfg.startingCash + cfg.monthlyContribution * 120) +
          '</strong> of your own money going in.</p>' +
          /* The single most common point of confusion, answered before it can
           * be asked. */
          '<div class="intro-note"><strong>So your balance goes up every month even if you buy nothing.</strong> ' +
          'That is not profit — it is your own money arriving. The small line under the big number tells you how much is actually profit.</div>'
        );
      }
    },
    {
      tag: 'What you can buy',
      title: 'Sixteen real things, in five groups',
      body: function () {
        return (
          '<p>Everything on the board is real: NZ companies like Mainfreight and Air New Zealand, international ones like Apple and Tesla, index funds, government bonds and crypto.</p>' +
          '<p>An <strong>index fund</strong> buys hundreds of companies in one go. A <strong>single company</strong> is a bet on one business — if it stumbles, you feel all of it.</p>' +
          '<p>Each one shows a risk rating. Higher risk means a <em>wider range of outcomes</em>, not a bigger reward. Hover any small chart to see what a company actually does and why it moves.</p>'
        );
      }
    },
    {
      tag: 'What moves prices',
      title: 'Four things, and they are all visible',
      body: function () {
        return (
          '<ol class="intro-list">' +
          '<li><strong>The economy.</strong> It cycles through expansion, overheating, recession and recovery. The panel on the right always shows where you are. In a recession almost everything risky falls together.</li>' +
          '<li><strong>News.</strong> An OCR change, a dairy auction, an earnings miss. Every headline explains what it means and why it matters.</li>' +
          '<li><strong>Expectations.</strong> A share price is really a guess about future profits. Good news raises the guess; doubt lowers it — even when nothing about the business changed today.</li>' +
          '<li><strong>Demand alone,</strong> for crypto. There are no profits underneath it, so the price is whatever the next person will pay.</li>' +
          '</ol>'
        );
      }
    },
    {
      tag: 'The catches',
      title: 'Three things quietly working against you',
      body: function (cfg) {
        const small = 50;
        const fee = cfg.feeFlat + small * cfg.feeRate;
        return (
          '<p><strong>Fees.</strong> ' +
          UI.money(cfg.feeFlat) +
          ' plus ' +
          UI.plainPct(cfg.feeRate, 1) +
          ' every time you buy or sell. On a ' +
          UI.money(small) +
          ' trade that is ' +
          UI.money(fee, 2) +
          ' — <strong>' +
          UI.plainPct(fee / small, 1) +
          ' gone before you own anything.</strong></p>' +
          '<p><strong>Inflation.</strong> Prices rise about 2.5% a year, so the same money buys less each year. Watch the "worth in today\'s money" tile.</p>' +
          '<p><strong>The benchmark.</strong> An invisible investor buys one world index fund on day one and never touches it again. They face the same prices and the same crashes as you. Beating them is harder than it sounds.</p>'
        );
      }
    }
  ];

  let overlay = null;
  let index = 0;
  let getCfg = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'intro-backdrop';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">' +
      '<div class="intro-head">' +
      '<span class="intro-tag" id="intro-tag"></span>' +
      '<button type="button" class="intro-skip" id="intro-skip">Skip</button>' +
      '</div>' +
      '<h2 id="intro-title"></h2>' +
      '<div class="intro-body" id="intro-body"></div>' +
      '<div class="intro-foot">' +
      '<div class="intro-dots" id="intro-dots"></div>' +
      '<div class="intro-nav">' +
      '<button type="button" class="ghost" id="intro-back">Back</button>' +
      '<button type="button" class="primary" id="intro-next">Next</button>' +
      '</div></div></div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#intro-skip').addEventListener('click', close);
    overlay.querySelector('#intro-back').addEventListener('click', function () {
      if (index > 0) show(index - 1);
    });
    overlay.querySelector('#intro-next').addEventListener('click', function () {
      if (index < CARDS.length - 1) show(index + 1);
      else close();
    });

    // Same trap as the crash modal: a dialog that claims aria-modal has to mean
    // it, or the keyboard walks out to the page behind.
    overlay.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        close();
        return;
      }
      if (ev.key !== 'Tab') return;
      const focusable = Array.prototype.slice
        .call(overlay.querySelectorAll('button'))
        .filter(function (b) {
          return !b.disabled;
        });
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  function show(i) {
    index = Math.max(0, Math.min(CARDS.length - 1, i));
    const card = CARDS[index];
    const cfg = getCfg ? getCfg() : Portfolio.DEFAULTS;

    overlay.querySelector('#intro-tag').textContent = card.tag;
    overlay.querySelector('#intro-title').textContent = card.title;
    overlay.querySelector('#intro-body').innerHTML = card.body(cfg);

    overlay.querySelector('#intro-dots').innerHTML = CARDS.map(function (c, n) {
      return '<span class="intro-dot' + (n === index ? ' is-on' : '') + '"></span>';
    }).join('');

    overlay.querySelector('#intro-back').disabled = index === 0;
    overlay.querySelector('#intro-next').textContent =
      index === CARDS.length - 1 ? 'Start investing' : 'Next';
  }

  function open(startAt) {
    if (!overlay) build();
    overlay.hidden = false;
    show(typeof startAt === 'number' ? startAt : 0);
    overlay.querySelector('#intro-next').focus();
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch (e) {
      /* private browsing — it just shows again next time, which is harmless */
    }
  }

  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  /* Shown automatically only on a first visit. A student on their third run
   * does not need briefing again, and a teacher demoing it should not have to
   * click through four cards each time. */
  function maybeOpen() {
    if (!seen()) open(0);
  }

  global.Intro = {
    open: open,
    close: close,
    maybeOpen: maybeOpen,
    attach: function (cfgGetter) {
      getCfg = cfgGetter;
      if (!overlay) build();
    }
  };
})(window);
