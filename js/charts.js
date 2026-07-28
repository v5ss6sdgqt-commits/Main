/* Canvas chart rendering.
 *
 * Hand-rolled rather than pulled from a charting library so the whole app stays
 * a set of static files with no build step and no network access — it runs from
 * a USB stick or a locked-down school Chromebook either way.
 *
 * Colors are read from CSS custom properties at draw time rather than baked in,
 * so a theme change is just a re-render. */

(function (global) {
  'use strict';

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function theme() {
    return {
      surface: token('--surface-1'),
      grid: token('--grid'),
      axis: token('--axis'),
      muted: token('--text-muted'),
      secondary: token('--text-secondary'),
      primary: token('--text-primary')
    };
  }

  /* Series colours arrive as resolved hex from the CSS tokens. Area fills need
   * the same hue at a low alpha, so this converts rather than adding a second
   * token per series that could drift out of step with the line colour. */
  function withAlpha(color, alpha) {
    const hex = String(color).trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    let r, g, b;
    if (long) {
      r = parseInt(long[1], 16);
      g = parseInt(long[2], 16);
      b = parseInt(long[3], 16);
    } else if (short) {
      r = parseInt(short[1] + short[1], 16);
      g = parseInt(short[2] + short[2], 16);
      b = parseInt(short[3] + short[3], 16);
    } else {
      // Not a hex we can read — skip the fill rather than paint something wrong.
      return null;
    }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  // Rounds an interval up to 1, 2, 2.5 or 5 times a power of ten.
  function niceStep(rough) {
    const exp = Math.floor(Math.log10(rough));
    const base = Math.pow(10, exp);
    const frac = rough / base;
    let mult;
    if (frac <= 1) mult = 1;
    else if (frac <= 2) mult = 2;
    else if (frac <= 2.5) mult = 2.5;
    else if (frac <= 5) mult = 5;
    else mult = 10;
    return mult * base;
  }

  function compactMoney(n) {
    const abs = Math.abs(n);
    if (abs >= 1000000) return '$' + (n / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + 'M';
    if (abs >= 1000) return '$' + (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
    return '$' + Math.round(n);
  }

  /* Line chart with crosshair, end markers and collision-aware end labels.
   * cfg: { series: [{name, color, values, width}], months, tooltip, onHover } */
  function line(canvas, cfg) {
    const state = { hover: null, cfg: cfg };

    function draw() {
      const c = setupCanvas(canvas);
      const ctx = c.ctx;
      const t = theme();
      const series = state.cfg.series.filter(function (s) {
        return s.values && s.values.length > 1;
      });
      if (!series.length) return;

      const padL = 58;
      const padR = 96;
      const padT = 18;
      const padB = 30;
      const plotW = c.w - padL - padR;
      const plotH = c.h - padT - padB;
      if (plotW <= 0 || plotH <= 0) return;

      const n = series[0].values.length;
      let lo = Infinity;
      let hi = -Infinity;
      series.forEach(function (s) {
        s.values.forEach(function (v) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        });
      });
      if (!isFinite(lo) || !isFinite(hi)) return;
      if (hi === lo) hi = lo + 1;

      /* Ticks are placed at round numbers *inside* the data range rather than by
       * rounding the range outward to the next round number. Rounding outward
       * can push the floor well below the lowest value — a $10k–$26k series
       * snapping to a $5k floor left the bottom third of the plot permanently
       * empty and squashed the line the reader came to see. */
      const pad = (hi - lo) * 0.08;
      const yMin = lo - pad;
      const yMax = hi + pad;
      const step = niceStep((yMax - yMin) / 4);
      const firstTick = Math.ceil(yMin / step) * step;

      const x = function (i) {
        return padL + (plotW * i) / Math.max(1, n - 1);
      };
      const y = function (v) {
        return padT + plotH * (1 - (v - yMin) / (yMax - yMin));
      };

      // Gridlines and y ticks — hairline, solid, one step off the surface.
      ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      // Stepping by an integer multiple avoids float drift accumulating.
      for (let k = 0; ; k++) {
        const v = firstTick + k * step;
        if (v > yMax) break;
        const py = Math.round(y(v)) + 0.5;
        ctx.strokeStyle = t.grid;
        ctx.beginPath();
        ctx.moveTo(padL, py);
        ctx.lineTo(padL + plotW, py);
        ctx.stroke();
        ctx.fillStyle = t.muted;
        ctx.fillText(compactMoney(v), padL - 10, py);
      }

      // X axis: one tick per year.
      const perYear = 12;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = t.muted;
      for (let m = 0; m < n; m += perYear) {
        const px = x(m);
        ctx.fillText(m === 0 ? 'Start' : 'Yr ' + m / perYear, px, padT + plotH + 9);
      }

      ctx.strokeStyle = t.axis;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(padT + plotH) + 0.5);
      ctx.lineTo(padL + plotW, Math.round(padT + plotH) + 0.5);
      ctx.stroke();

      /* Area fills, drawn under every line so the strokes stay crisp on top.
       * Kept faint — at this alpha two overlapping fills still read as two
       * distinct washes rather than turning the plot into mud. */
      series.forEach(function (s) {
        const top = withAlpha(s.fill || s.color, 0.17);
        const bottom = withAlpha(s.fill || s.color, 0);
        if (!top || !bottom) return;

        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, top);
        grad.addColorStop(1, bottom);

        ctx.fillStyle = grad;
        ctx.beginPath();
        s.values.forEach(function (v, i) {
          const px = x(i);
          const py = y(v);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.lineTo(x(n - 1), padT + plotH);
        ctx.lineTo(x(0), padT + plotH);
        ctx.closePath();
        ctx.fill();
      });

      // Series lines.
      series.forEach(function (s) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width || 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        s.values.forEach(function (v, i) {
          const px = x(i);
          const py = y(v);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });

      // Crosshair sits under the end markers so markers stay readable.
      if (state.hover !== null && state.hover >= 0 && state.hover < n) {
        const hx = Math.round(x(state.hover)) + 0.5;
        ctx.strokeStyle = t.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, padT + plotH);
        ctx.stroke();

        series.forEach(function (s) {
          const py = y(s.values[state.hover]);
          ctx.beginPath();
          ctx.arc(hx, py, 5, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = t.surface;
          ctx.stroke();
        });
      }

      // End markers: 10px dots with a 2px surface ring.
      const ends = series.map(function (s) {
        return { s: s, px: x(n - 1), py: y(s.values[n - 1]) };
      });
      ends.forEach(function (e) {
        ctx.beginPath();
        ctx.arc(e.px, e.py, 5, 0, Math.PI * 2);
        ctx.fillStyle = e.s.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = t.surface;
        ctx.stroke();
      });

      /* Direct end labels. When the two lines converge the labels would overlap;
       * rather than stacking them detached from their lines, they get pushed
       * apart and a thin leader connects each label back to its own endpoint. */
      const sorted = ends.slice().sort(function (a, b) {
        return a.py - b.py;
      });
      const minGap = 15;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].py - sorted[i - 1].py < minGap) {
          sorted[i].labelY = sorted[i - 1].labelY !== undefined ? sorted[i - 1].labelY + minGap : sorted[i - 1].py + minGap;
        }
      }
      sorted.forEach(function (e) {
        if (e.labelY === undefined) e.labelY = e.py;
        e.labelY = Math.max(padT + 6, Math.min(padT + plotH - 6, e.labelY));
      });

      ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      sorted.forEach(function (e) {
        if (Math.abs(e.labelY - e.py) > 2) {
          ctx.strokeStyle = t.axis;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(e.px + 6, e.py);
          ctx.lineTo(e.px + 12, e.labelY);
          ctx.stroke();
        }
        // Labels wear text tokens; the colored dot beside them carries identity.
        ctx.fillStyle = t.secondary;
        ctx.fillText(compactMoney(e.s.values[n - 1]), e.px + 14, e.labelY);
      });
    }

    function pointFromEvent(ev) {
      const rect = canvas.getBoundingClientRect();
      const padL = 58;
      const padR = 96;
      const plotW = rect.width - padL - padR;
      const n = state.cfg.series[0].values.length;
      const rel = (ev.clientX - rect.left - padL) / Math.max(1, plotW);
      return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    }

    function onMove(ev) {
      const idx = pointFromEvent(ev);
      if (idx !== state.hover) {
        state.hover = idx;
        draw();
      }
      if (state.cfg.onHover) state.cfg.onHover(idx, ev);
    }

    function onLeave() {
      state.hover = null;
      draw();
      if (state.cfg.onHover) state.cfg.onHover(null, null);
    }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener(
      'touchmove',
      function (ev) {
        if (ev.touches && ev.touches.length) {
          onMove(ev.touches[0]);
          ev.preventDefault();
        }
      },
      { passive: false }
    );
    canvas.addEventListener('touchend', onLeave);

    return {
      draw: draw,
      update: function (nextCfg) {
        state.cfg = Object.assign({}, state.cfg, nextCfg);
        draw();
      }
    };
  }

  /* Single-series sparkline for the market table. Identity comes from the asset
   * name in the same row, so the color here is reinforcement, not the only cue. */
  function sparkline(canvas, values, color) {
    const c = setupCanvas(canvas);
    const ctx = c.ctx;
    if (!values || values.length < 2) return;

    const padY = 3;
    let lo = Math.min.apply(null, values);
    let hi = Math.max.apply(null, values);
    if (hi === lo) hi = lo + 1;

    const x = function (i) {
      return (c.w * i) / (values.length - 1);
    };
    const y = function (v) {
      return padY + (c.h - padY * 2) * (1 - (v - lo) / (hi - lo));
    };

    // Same treatment as the main chart, so sixteen tiny charts read as one set.
    const top = withAlpha(color, 0.24);
    const bottom = withAlpha(color, 0);
    if (top && bottom) {
      const grad = ctx.createLinearGradient(0, 0, 0, c.h);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      values.forEach(function (v, i) {
        if (i === 0) ctx.moveTo(x(i), y(v));
        else ctx.lineTo(x(i), y(v));
      });
      ctx.lineTo(x(values.length - 1), c.h);
      ctx.lineTo(x(0), c.h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    values.forEach(function (v, i) {
      if (i === 0) ctx.moveTo(x(i), y(v));
      else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  global.Charts = {
    line: line,
    sparkline: sparkline,
    compactMoney: compactMoney,
    theme: theme
  };
})(window);
