# Tests

Nothing here ships. The app itself still has no dependencies, no build step and
no framework — these scripts drive a real Chromium from the outside, which is
the only honest way to test something whose whole job is what a student sees on
screen.

## Running them

```
npm install -g playwright
npx playwright install chromium

node tests/run.js            # every regression suite
node tests/run.js pwa div    # just the ones whose names match
node tests/run.js --list     # what each one covers
node tests/run.js --tools    # also run the slow model-tuning tools
```

`run.js` starts the static servers the suites need and stops them afterwards.
Half the confusing failures in this project's history were a suite pointed at a
port with nothing behind it and read as though the app were broken, so the
runner owns that now rather than leaving it to whoever is running the tests.

Everything is derived in `config.js` — no absolute paths, no hardcoded ports.
To point a suite somewhere else, including a deployed site:

```
BASE=https://v5ss6sdgqt-commits.github.io/Main node tests/pwa-test.js
```

## What is here, and why

### Regression suites

Run these after changing anything. Each prints `ERRORS: none` when clean.

| | |
|---|---|
| `v2-test` | Page structure, glossary terms, a full run end to end |
| `smoke` | Broad smoke test, model calibration, and the IRR definition |
| `bundle-test` | The single-file `dist/` bundle still plays a whole game |
| `pwa-test` | Service worker registers, manifest is valid, offline reload works |
| `mobile-pwa` | Phone layout, no horizontal scroll, offline on mobile |
| `subpath` | Served from a subdirectory, the way GitHub Pages does it |
| `swver` | An updated page never runs scripts left in an old cache |
| `chipall` | Every "see also" link in the glossary actually navigates |
| `board` | Result codes round-trip, tampering is rejected, leaderboard ranks |
| `comp` | Competition mode against each AI opponent |
| `econ` | The economy panel, GDP, and the four phases of the cycle |
| `div` | Dividends are paid, shown per company, and explained |
| `disc` | The disclaimer and what the app says it leaves out |
| `panel` | The asset detail panel: hover, pin, keyboard, viewport edges |
| `fourth` | The targeted "sell just the crypto" crash option |
| `intro-test` | The opening briefing, on desktop and on a phone |
| `hunt` | Edge cases: no goal, tiny balances, fuzzed clicking |
| `hunt2` | Model fuzz — 400 runs, asserting invariants every month |
| `uifuzz3` | UI fuzz — a full run clicking real controls, scanning for junk |

Three of these exist because of a specific bug that reached a working build, and
they are worth understanding before deleting anything:

- **`swver`** — the service worker used to serve a returning student last week's
  JavaScript against this week's page. Since `js/market.js` *is* the market, two
  students could type the same seed and get different prices with nothing on
  screen to explain it. It checks both directions: an old-style cache entry must
  be ignored, and a current one must be used, because only the second half
  proves the first half is doing anything.
- **`chipall`** — a glossary link silently did nothing for weeks. Opening a term
  rewrites the panel, which detached the very chip that had been clicked.
- **`panel`** — the detail panel died on any outside click, including "Next
  year", which is the one thing you most want to press while watching an asset.

### Tuning tools

Slow, and only for deliberately retuning the model. Not part of a normal run.

| | |
|---|---|
| `calibrate` | Do realised returns match each asset's stated expectation? |
| `seedcheck` | Where a seed sits in the distribution of possible markets |
| `pickseed5` | Search thousands of seeds for a good teaching market |
| `ladder` | Are the AI opponents actually ordered easy < medium < hard? |
| `bots` | What each opponent does over many runs |

`calibrate` is the one to reach for after touching `mu`, `sigma` or a dividend
in `js/market.js`. Note that it targets **`mu - dividend`**: `mu` is the total
return, and the price only has to deliver the part the dividend does not. An
earlier version compared price growth against the *total* and reported a 4.45
point error that did not exist.

`pickseed5` is how the three default seeds in `js/app.js` were chosen — 4,000
candidates each, filtered on the world fund landing near its stated 8%, no
speculative asset beating it, bitcoin losing to it, a fall of at least a quarter
to sit through, all four phases of the cycle appearing, and the crash decisions
spread across the run rather than bunched at one end.

## A warning about writing new ones

More bugs in this project's history were faults in a test than faults in the
app. The ones that cost the most time:

- Clicking a button that CSS had hidden. `element.click()` in JavaScript fires
  on hidden elements, so a suite happily drove a crash modal option that no
  student can see, and reported nonsense back. Check
  `getComputedStyle(el).display !== 'none'` before clicking.
- Sampling a canvas before the first animation frame, and concluding the
  animation was dead.
- Comparing price-only returns against a total return that included dividends.
- A tamper check that mangled a result code into six parts, so `decode` returned
  `null` rather than `{invalid: true}` — and the test read that as "accepted".

When a suite reports something alarming, confirm the app is really wrong before
changing it. Twice the fastest route was a `MutationObserver` in the page,
watching what actually changed.
