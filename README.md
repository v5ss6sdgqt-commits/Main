# Market Lab

An investing simulator for teaching economics and financial literacy to high
school students. Students get a starting balance and a monthly deposit, and
spend ten simulated years deciding what to do with it. At the end the app shows
them what would have happened if they had simply bought an index fund on day one
and never touched it again.

That comparison is the point of the whole thing. Compounding, risk, fees and
inflation are hard to teach as definitions and easy to feel when you have just
watched them happen to your own money.

## Running it

Open `index.html` in a browser. That is the entire setup.

```
git clone https://github.com/v5ss6sdgqt-commits/Main.git
cd Main
git checkout claude/student-life-improvement-ideas-jnhfwr
open index.html          # macOS — use `start` on Windows, `xdg-open` on Linux
```

There is no build step, no package install and no network access — plain HTML,
CSS and JavaScript with no dependencies. It runs from a USB stick, off a school
network share, or from GitHub Pages, and it works offline on a locked-down
Chromebook. Nothing is transmitted anywhere and no data is stored beyond a
light/dark theme preference.

### Handing it out as a single file

`dist/market-lab.html` is the whole app inlined into one 77 KB file. Email it to
a class, drop it on a shared drive, or put it on a USB stick — there is no
folder structure to keep intact and nothing to load over the network.

Rebuild it after changing any source file:

```
node build.js
```

### Publishing it for a class

Enabling GitHub Pages on this branch serves the app at a URL students can open
on a phone, with no install and no accounts. In the repository: **Settings →
Pages → Source: Deploy from a branch**, then pick this branch and the root
folder.

## Using it in a lesson

**Give the whole class the same seed.** The "Market seed" box drives every
random number in the simulation, so `classroom-182` produces an identical ten
years of prices and news on every machine. Students face the same crash on the
same month, which turns "how did you do?" into a real comparison of decisions
rather than a comparison of luck.

Some things that work well:

- Run it twice with the same seed and a different strategy each time.
- Have half the class buy and hold, and half trade actively, then compare fees.
- Change the seed and re-run the *same* strategy, to show how much of any single
  result was chance.
- Set the run to 20 years and watch how much harder the benchmark becomes to
  beat as the time horizon grows.

## What it is designed to teach

| Idea | How the simulator makes it visible |
|---|---|
| Risk and return travel together | Bitcorn has the highest expected return and by far the widest spread of outcomes |
| Compounding rewards time, not activity | The benchmark line quietly pulls ahead of most students |
| Diversification genuinely reduces risk | Assets are correlated, not independent, so a mix really is steadier |
| Fees are small and relentless | 0.5% per trade, with the running total always on screen |
| Inflation erodes cash | Savings pay 2% while prices rise ~2.5%, shown as "worth in today's money" |
| Single stocks carry risk funds don't | One earnings miss takes 17% off Nimbus; the index barely notices |

## How the simulation works

Prices follow geometric Brownian motion stepped one month at a time. Each
asset's monthly shock is split between a shared market factor and its own
idiosyncratic noise, weighted by a correlation parameter. That structure matters:
without it, spreading money across assets would look like it reduced risk while
the numbers quietly said otherwise, and diversification would be a lesson the
simulator contradicted.

Assets are calibrated to rough real-world long-run figures:

| Asset | Expected return | Volatility | Correlation with market |
|---|---|---|---|
| Government Bond Fund | 4% | 6% | 0.15 |
| Total Market Index Fund | 9% | 15% | 1.00 |
| Ridgeline Energy | 7.5% | 28% | 0.55 |
| Nimbus Software | 12% | 34% | 0.75 |
| Bitcorn | 14% | 75% | 0.30 |

Two details are worth knowing if you plan to modify it.

**Expected return is the compound rate, not the arithmetic mean.** The textbook
GBM drift term of `mu - sigma^2/2` makes `mu` the arithmetic mean, which leaves
the typical path growing far slower than the headline figure — at Bitcorn's 75%
volatility that gap is 28 percentage points a year, enough that buying and
holding crypto would have compounded at roughly **-18% a year** over 30 years.
The simulator would have been teaching that crypto is a certain loss rather than
a wide spread of outcomes, so `mu` goes into the drift directly and the median
path compounds at the stated rate. Verified by simulation: over 400 runs the
median matches the target for every asset at both 10 and 30 year horizons.

**News events are drift-neutralised.** Percentage shocks do not cancel — a -33%
crash followed by a +38% rally leaves you down 7.5%, not up 5%. Left uncorrected
that asymmetry silently drags every asset below its stated return, worst for the
assets with the biggest headlines. Each asset's expected log drag from events is
computed up front and removed from its drift, so events add drama without
rewriting the risk/return table students are reasoning about.

**Growth per year is a money-weighted return (IRR).** Dividing the final value by
total contributions would charge the deposit made in the final month with ten
years of growth it never had, understating the real rate by several points. The
app solves for the internal rate of return against the actual monthly cash flows
instead.

## Files

```
index.html        layout and copy
build.js          bundles everything into dist/market-lab.html
css/styles.css    design tokens, light/dark themes, responsive layout
js/rng.js         seeded PRNG and normal variates
js/market.js      assets, price engine, news events, inflation
js/portfolio.js   holdings, trades, fees, the benchmark, results
js/charts.js      canvas line chart and sparklines
js/ui.js          DOM rendering
js/app.js         bootstrap and event wiring
```

## Accessibility and design notes

The categorical colors were validated for colorblind separation and contrast
against both the light and dark surfaces before being adopted, and the dark
theme uses the same hues re-stepped for the dark surface rather than an
automatic inversion. Asset identity is always carried by a text label beside the
colored mark, never by color alone. The portfolio chart has a table view
alongside it so no value is reachable only by hovering.

## A caveat worth passing on to students

Real markets are not this well behaved. Returns are not normally distributed,
crashes cluster, correlations rise exactly when diversification is most needed,
and no one knows any asset's expected return in advance. This is a model built
to make a handful of ideas visible in a single lesson, not a forecast. Any single
ten-year run is one roll of the dice — which is itself one of the more valuable
things it can demonstrate.
