/* Result codes, and the class leaderboard built on them.
 *
 * Every comparable tool in this space — The Stock Market Game, HowTheMarketWorks,
 * PersonalFinanceLab — leans on a leaderboard, and the research behind them
 * credits the competition for the jump in engagement. All of them do it with
 * accounts and a server.
 *
 * This app has neither and should not get either: it has to run offline on a
 * locked-down school Chromebook, and asking a teacher to create accounts for
 * thirty fifteen-year-olds is exactly the friction that stops a tool being used.
 *
 * So the result travels in a short code the student reads out or pastes into a
 * chat, and the teacher ranks them by pasting the lot into a box. No accounts,
 * no network, no data leaving anybody's machine.
 *
 * The code carries the seed, so the leaderboard can tell when two students did
 * not actually play the same market and say so — which turns a spoiled
 * comparison into a teachable moment about why the seed matters.
 *
 * The checksum catches typos and casual edits. It is not security, and it is not
 * pretending to be: a student who wants to fake a result can read this file. */

(function (global) {
  'use strict';

  const PREFIX = 'ML1';
  const GOAL_ORDER = ['none', 'flat', 'car', 'oe'];

  function b36(n, width) {
    let s = Math.max(0, Math.round(n)).toString(36).toUpperCase();
    while (width && s.length < width) s = '0' + s;
    return s;
  }

  function hashSeed(text) {
    let h = 2166136261 >>> 0;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function checksum(parts) {
    let h = 7;
    parts.join('-').split('').forEach(function (ch) {
      h = (h * 31 + ch.charCodeAt(0)) % 1296;
    });
    return b36(h, 2);
  }

  function encode(state, opponent) {
    const years = state.market.months / Market.MONTHS_PER_YEAR;
    const goalIdx = Math.max(0, GOAL_ORDER.indexOf(state.goal ? state.goal.id : 'none'));
    const parts = [
      PREFIX,
      b36(hashSeed(state.market.seed) % 1679616, 4),
      b36(years, 1),
      b36(goalIdx, 1) + (opponent ? b36(1 + Opponents.LEVELS.indexOf(opponent.level), 1) : '0'),
      b36(Portfolio.totalValue(state), 4),
      b36(state.tradeCount, 2)
    ];
    parts.push(checksum(parts));
    return parts.join('-');
  }

  function decode(text) {
    const code = String(text).trim().toUpperCase();
    const parts = code.split('-');
    if (parts.length !== 7 || parts[0] !== PREFIX) return null;
    if (checksum(parts.slice(0, 6)) !== parts[6]) return { invalid: true, code: code };

    const flags = parts[3];
    const oppIdx = parseInt(flags.charAt(1), 36);
    return {
      code: code,
      seedKey: parts[1],
      years: parseInt(parts[2], 36),
      goal: GOAL_ORDER[parseInt(flags.charAt(0), 36)] || 'none',
      opponent: oppIdx > 0 && Opponents.LEVELS[oppIdx - 1] ? Opponents.LEVELS[oppIdx - 1] : null,
      value: parseInt(parts[4], 36),
      trades: parseInt(parts[5], 36)
    };
  }

  /* Accepts one entry per line, each optionally preceded by a name:
   *
   *   Aroha  ML1-XXXX-A-20-2FK-3-9C
   *   ML1-XXXX-A-20-1Z8-11-4B
   *
   * Ranked by final value, with a warning when the codes are not all from the
   * same market — comparing those is comparing luck, not decisions. */
  function leaderboard(text) {
    const rows = [];
    String(text)
      .split('\n')
      .forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed) return;

        const match = /(ML1(?:-[0-9A-Z]+){6})\s*$/i.exec(trimmed);
        if (!match) {
          rows.push({ invalid: true, name: trimmed.slice(0, 40), reason: 'not a result code' });
          return;
        }
        const parsed = decode(match[1]);
        if (!parsed) {
          rows.push({ invalid: true, name: trimmed.slice(0, 40), reason: 'not a result code' });
          return;
        }
        if (parsed.invalid) {
          rows.push({ invalid: true, name: trimmed.slice(0, 40), reason: 'code looks mistyped' });
          return;
        }
        const name = trimmed.slice(0, match.index).trim().replace(/[,:]$/, '');
        parsed.name = name || 'Anonymous';
        rows.push(parsed);
      });

    const valid = rows.filter(function (r) {
      return !r.invalid;
    });
    valid.sort(function (a, b) {
      return b.value - a.value;
    });
    valid.forEach(function (r, i) {
      r.rank = i + 1;
    });

    const seeds = {};
    const lengths = {};
    valid.forEach(function (r) {
      seeds[r.seedKey] = true;
      lengths[r.years] = true;
    });

    return {
      rows: valid,
      rejected: rows.filter(function (r) {
        return r.invalid;
      }),
      mixedMarkets: Object.keys(seeds).length > 1,
      mixedLengths: Object.keys(lengths).length > 1
    };
  }

  global.Share = {
    encode: encode,
    decode: decode,
    leaderboard: leaderboard
  };
})(window);
