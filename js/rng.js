/* Seeded random number generation.
 *
 * Everything stochastic in the simulation draws from here so that a given seed
 * reproduces the same market exactly. That lets a teacher hand the whole class
 * one seed and compare decisions against an identical price history. */

(function (global) {
  'use strict';

  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32
  function makeRng(seedText) {
    let a = hashSeed(String(seedText));

    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    let spare = null;

    // Box-Muller, caching the second variate.
    function normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mag * Math.cos(2 * Math.PI * v);
    }

    return {
      next: next,
      normal: normal,
      pick: function (arr) {
        return arr[Math.floor(next() * arr.length)];
      }
    };
  }

  global.Rng = { make: makeRng };
})(window);
