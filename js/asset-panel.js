/* The asset detail panel.
 *
 * A 62x22px sparkline shows a vague shape and nothing else — you cannot read a
 * value off it, or see when the crash hit. Hovering one opens this, which gives
 * the same data at a size you can actually read.
 *
 * It carries more than the chart, because two useful fields on every asset were
 * being written and never displayed: `what` (what the company actually does) and
 * `blurb` (why it behaves the way it does). A student deciding whether to buy
 * Air New Zealand is better served by "a famous company and a famously poor
 * long-run investment" than by a squiggle.
 *
 * Opens on hover, click, or keyboard — hover alone would be unusable on a phone
 * and invisible to anyone navigating by keyboard. A click pins it so the pointer
 * can leave; anything else closes on mouse-out.
 *
 * Structure deliberately mirrors js/glossary.js, which already solved
 * positioning, dismissal and focus return. */

(function (global) {
  'use strict';

  const HOVER_DELAY = 220;

  let panel = null;
  let chart = null;
  let anchorEl = null;
  let assetId = null;
  let pinned = false;
  let openTimer = null;
  let openedAt = 0;
  let getState = null;

  function build() {
    panel = document.createElement('div');
    panel.className = 'asset-pop';
    panel.setAttribute('role', 'dialog');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ap-head">' +
      '<div><div class="ap-name"></div><div class="ap-sub"></div></div>' +
      '<div class="ap-right"><span class="ap-risk"></span>' +
      '<button type="button" class="ap-close" aria-label="Close">&times;</button></div>' +
      '</div>' +
      '<div class="ap-chart"><canvas></canvas></div>' +
      '<div class="ap-stats"></div>' +
      '<p class="ap-what"></p>' +
      '<p class="ap-blurb"></p>' +
      '<div class="ap-holding"></div>';
    document.body.appendChild(panel);

    panel.querySelector('.ap-close').addEventListener('click', close);
    // Pointer inside the panel keeps it alive even when it was only hovered.
    panel.addEventListener('mouseenter', function () {
      clearTimeout(openTimer);
    });
    panel.addEventListener('mouseleave', function () {
      if (!pinned) close();
    });
  }

  function close() {
    clearTimeout(openTimer);
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    pinned = false;
    assetId = null;
    const previous = anchorEl;
    anchorEl = null;
    if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
  }

  function place() {
    if (!anchorEl) return;
    // On a phone it is a bottom sheet pinned by CSS; measuring here would fight
    // the stylesheet.
    if (window.matchMedia('(max-width: 620px)').matches) {
      panel.style.left = '';
      panel.style.top = '';
      return;
    }

    const box = anchorEl.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 10;
    const viewport = document.documentElement.clientWidth;

    /* Anchored to the right of the sparkline where there is room, because the
     * trade controls sit to its right and covering them mid-decision is rude. */
    let left = box.right + window.scrollX + 12;
    if (left + width > window.scrollX + viewport - margin) {
      left = box.left + window.scrollX - width - 12;
    }
    if (left < window.scrollX + margin) {
      left = window.scrollX + Math.max(margin, (viewport - width) / 2);
    }

    let top = box.top + window.scrollY + box.height / 2 - height / 2;
    const minTop = window.scrollY + margin;
    const maxTop = window.scrollY + window.innerHeight - height - margin;
    top = Math.max(minTop, Math.min(maxTop, top));

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function render() {
    const state = getState && getState();
    if (!state || !assetId || !panel || panel.hidden) return;

    const a = Market.byId(assetId);
    if (!a) return;

    const m = state.month;
    const price = Portfolio.priceOf(state, a.id);
    const change = state.market.returns[a.id][m];
    const sinceStart = price / a.start - 1;
    const held = Portfolio.holdingValue(state, a.id);

    panel.querySelector('.ap-name').textContent = a.name;
    panel.querySelector('.ap-sub').textContent = a.ticker + ' · ' + a.where;

    const risk = panel.querySelector('.ap-risk');
    risk.textContent = UI.riskWord(a.risk);
    risk.className = 'ap-risk risk risk-' + a.risk;

    panel.querySelector('.ap-stats').innerHTML = [
      { k: 'Price now', v: UI.price(price) },
      { k: 'This month', v: m === 0 ? '—' : UI.pct(change), cls: m === 0 ? '' : change >= 0 ? 'up' : 'down' },
      { k: 'Since the start', v: m === 0 ? '—' : UI.pct(sinceStart), cls: m === 0 ? '' : sinceStart >= 0 ? 'up' : 'down' },
      { k: 'Past → expected', v: UI.plainPct(a.past.ret, 0) + ' → ' + UI.plainPct(a.mu, 1) }
    ]
      .map(function (s) {
        return (
          '<div class="ap-stat"><div class="ap-k">' +
          s.k +
          '</div><div class="ap-v ' +
          (s.cls || '') +
          '">' +
          s.v +
          '</div></div>'
        );
      })
      .join('');

    panel.querySelector('.ap-what').textContent = a.what;
    panel.querySelector('.ap-blurb').textContent = a.blurb;

    panel.querySelector('.ap-holding').innerHTML =
      held > 0.005
        ? '<span class="ap-hold-k">You hold</span><span class="ap-hold-v">' +
          UI.money(held) +
          ' · ' +
          state.shares[a.id].toFixed(state.shares[a.id] < 1 ? 4 : 2) +
          ' units</span>'
        : '<span class="ap-hold-k">You do not own any of this</span>';

    drawChart(state, a);
  }

  function drawChart(state, a) {
    const canvas = panel.querySelector('.ap-chart canvas');
    const values = state.market.prices[a.id].slice(0, state.month + 1);

    const cfg = {
      /* No second series here, so the main chart's wide right margin would be
       * empty space — but it still needs room for the end label, which runs to
       * "$178k" for bitcoin and "$0.83" for Air New Zealand. Too tight and the
       * price gets clipped by the panel edge. */
      pad: { l: 52, r: 62, t: 14, b: 24 },
      series: [
        {
          key: a.id,
          name: a.name,
          color: UI.resolveColor(a.color),
          fill: UI.resolveColor(a.color),
          // One point draws nothing, so month zero shows a flat line at the
          // opening price rather than an empty box.
          values: values.length > 1 ? values : [a.start, a.start]
        }
      ]
    };

    if (!chart || chart.canvas !== canvas) {
      chart = Charts.line(canvas, cfg);
      chart.canvas = canvas;
      chart.draw();
    } else {
      chart.update(cfg);
    }
  }

  function open(id, trigger, isPinned) {
    if (!panel) build();
    const state = getState && getState();
    if (!state) return;

    assetId = id;
    anchorEl = trigger;
    pinned = !!isPinned;
    panel.hidden = false;
    render();
    place();
    openedAt = window.scrollY;
  }

  function attach(stateGetter) {
    getState = stateGetter;
    if (!panel) build();

    const body = document.getElementById('market-body');

    body.addEventListener('mouseover', function (ev) {
      const btn = ev.target.closest('.spark-btn');
      if (!btn || pinned) return;
      const id = btn.getAttribute('data-asset');
      if (id === assetId && !panel.hidden) return;
      clearTimeout(openTimer);
      // A delay so sweeping the pointer across the table does not strobe.
      openTimer = setTimeout(function () {
        open(id, btn, false);
      }, HOVER_DELAY);
    });

    body.addEventListener('mouseout', function (ev) {
      const btn = ev.target.closest('.spark-btn');
      if (!btn || pinned) return;
      // Moving into the panel itself must not close it.
      const to = ev.relatedTarget;
      if (to && (to.closest('.asset-pop') || to.closest('.spark-btn') === btn)) return;
      clearTimeout(openTimer);
      close();
    });

    body.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.spark-btn');
      if (!btn) return;
      ev.preventDefault();
      const id = btn.getAttribute('data-asset');
      // Clicking the pinned asset again closes it; anything else pins that one.
      if (pinned && id === assetId) close();
      else open(id, btn, true);
    });

    /* A pinned panel is dismissed by clicking empty page, not by clicking a
     * control. Pinning bitcoin and then pressing "Next year" to watch it move is
     * the whole reason pinning exists, and a blanket outside-click rule killed
     * the panel on the first button press. Escape and the close button are
     * always available, so this only loosens an extra convenience. */
    document.addEventListener('click', function (ev) {
      if (panel.hidden || !pinned) return;
      if (ev.target.closest('.asset-pop') || ev.target.closest('.spark-btn')) return;
      if (ev.target.closest('button, input, select, textarea, label, a')) return;
      close();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !panel.hidden) close();
    });

    window.addEventListener('resize', function () {
      if (!panel.hidden) place();
    });

    // Only a deliberate scroll dismisses; focusing can nudge the page a pixel.
    window.addEventListener(
      'scroll',
      function () {
        if (!panel.hidden && Math.abs(window.scrollY - openedAt) > 8) close();
      },
      { passive: true }
    );
  }

  global.AssetPanel = {
    attach: attach,
    open: open,
    close: close,
    // Called from renderAll so an open panel keeps up as months advance.
    refresh: render,
    isOpen: function () {
      return !!panel && !panel.hidden;
    }
  };
})(window);
