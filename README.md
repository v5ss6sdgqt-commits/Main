# Market Lab

An investing simulator for teaching economics and financial literacy to New
Zealand high school students. Students start with $1,000 and $50 a month from a
part-time job, and spend ten simulated years deciding what to do with it across
real NZ companies, international companies, index funds and crypto. At the end
the app shows them what would have happened if they had simply bought a world
index fund on day one and never touched it again.

That comparison is the point of the whole thing. Compounding, risk, fees and
inflation are hard to teach as definitions and easy to feel when you have just
watched them happen to your own money.

Every financial term in the app is clickable. Tapping **Fees paid** explains what
a fee is, why it exists, and what a $3 flat fee does to a $50 trade — using the
student's own numbers.

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

### Installing it as an app

Once the app is served over HTTPS it can be installed, so it gets its own icon
and opens in its own window with no browser chrome and no URL to type.

1. In the repository, go to **Settings → Pages → Source: Deploy from a branch**,
   pick this branch and the root folder, and wait for the first deploy.
2. Open the published URL — `https://<user>.github.io/Main/`.
3. Install it:
   - **Chrome / Edge, desktop:** click **Install app** in the header, or the
     install icon at the right of the address bar.
   - **Android:** the same **Install app** button, or Chrome's menu → *Add to
     Home screen*.
   - **iPhone / iPad:** Safari's Share button → *Add to Home Screen*. Safari
     does not support the install button, so this is the route on iOS.

After installing it works with no connection at all. A service worker caches the
whole app on first visit, so it opens instantly and keeps working offline —
useful in a classroom with unreliable wifi.

Page loads use network-first, so a student who opens the app online always gets
the current version rather than whatever was cached the day they installed it.
When you deploy a change to the app shell, bump `CACHE` in `sw.js` so the old
cache is discarded.

Service workers are refused on `file://` URLs, so opening `index.html` straight
off disk still works but skips the offline cache and the install button. That
path is for development; installing is for classroom use.

## Using it in a lesson

**Give the whole class the same seed.** The "Market seed" box drives every
random number in the simulation, so `classroom-2910` produces an identical ten
years of prices and news on every machine. Students face the same crash on the
same month, which turns "how did you do?" into a real comparison of decisions
rather than a comparison of luck.

**Press play and let it run.** The simulation advances on its own and pauses
itself on a crash or a recovery, which are the moments worth stopping to discuss.
Speed is adjustable; the fast setting covers a decade in under half a minute.

Some things that work well:

- Before starting, have everyone write down which asset they think will win. Then
  run the default seed, where the answer is Air New Zealand and almost every
  exciting pick finishes negative.
- Have half the class buy and hold, and half trade every month, then compare the
  fees tile. The $3 flat fee does the teaching for you.
- Run it twice with the same seed and a different strategy each time.
- Change the seed and re-run the *same* strategy, to show how much of any single
  result was chance.
- Set the run to 20 or 30 years and watch how much harder the benchmark becomes
  to beat as the time horizon grows. The spread of outcomes narrows sharply too:
  Ethereum's 10th-percentile return is -23.5% a year over ten years and -11.6%
  over thirty. Time does not reduce risk to zero, but it does reduce it.

## The assets

Sixteen real things, grouped into five categories.

| Category | What is in it |
|---|---|
| Safe stuff | NZ Government Bond Fund, KiwiSaver Balanced Fund |
| Index funds | S&P/NZX 50, S&P 500, Total World |
| NZ companies | Fisher & Paykel Healthcare, Mainfreight, Xero, Meridian Energy, a2 Milk, Air New Zealand |
| International | Apple, Nvidia, Tesla |
| Crypto | Bitcoin, Ethereum |

Prices are in NZD. Currency conversion is deliberately not modelled, which is a
real simplification — the glossary says so to students rather than hiding it.

## The most important design decision

Every asset carries **two** return figures, and they deliberately disagree.

`past` is roughly what the real thing actually returned. `mu` is what the
simulation assumes it will return from here. Nvidia's are 33% and 9%.

If the simulation used past returns as future returns, it would teach students
that the winning move is to buy whatever won last decade — Nvidia at 33% a year,
forever. That is precisely the mistake real investors make, and a simulator that
rewards it is worse than no simulator.

So `mu` is shrunk hard toward an ordinary share-like return, and the individual
companies all sit within about two points of each other regardless of how
spectacular or dismal their history was. What stays different between them is
**risk**. That asymmetry is real: past volatility predicts future volatility
fairly well, while past returns barely predict future returns at all.

The table shows both numbers side by side — struck-through past next to bold
expected — and the glossary explains the gap. Noticing it is the single most
valuable thing a fifteen-year-old can take away from this.

## Explaining the words

Every financial term in the app is a clickable button that opens a plain-language
explanation, written for someone who has never heard the word and is not yet
convinced they care. Where possible the explanation uses the student's own live
numbers: opening **Fees paid** shows what *they* have spent across *their* trades,
not a generic definition.

Twenty-four terms are covered, including the NZ-specific ones students will
actually meet — KiwiSaver, the OCR, and why the exchange rate matters when you
buy overseas shares. They live in `js/glossary.js`; adding one means adding an
entry there and a `data-term` attribute wherever it should be tappable.

## What it is designed to teach

| Idea | How the simulator makes it visible |
|---|---|
| Last decade's winner is not next decade's | Every past return sits beside a much lower expected one |
| Risk and return travel together | Ethereum moves 85% a year and is expected to return no more than shares |
| Compounding rewards time, not activity | The benchmark line quietly pulls ahead of most students |
| Diversification means uncorrelated, not numerous | Six NZ shares share an NZ economy factor, so they fall together |
| Small trades are eaten by fees | A $3 flat fee is 6% of a $50 trade and 0.06% of a $5,000 one |
| Inflation erodes cash | Savings pay 3% while prices rise about 2.5% |
| Single stocks carry risk funds don't | One earnings miss takes 19% off Xero; the index barely notices |

## How the simulation works

Prices follow geometric Brownian motion stepped one month at a time. Each
asset's monthly shock is split between **two** shared factors — a world market
factor and a separate New Zealand factor — plus its own idiosyncratic noise.

The second factor is what makes NZ shares move together more than they move with
Wall Street, which is both true and the reason holding Mainfreight and Apple is
genuinely more diversified than holding Mainfreight and Fisher & Paykel. Without
that structure, spreading money across NZ names would look like it reduced risk
while the numbers quietly said otherwise.

Three details are worth knowing if you plan to modify it.

**Expected return is the compound rate the median path actually achieves.** Two
things have to be right for that. First, the textbook GBM drift of `mu - sigma^2/2`
is not used, because it would make `mu` the *arithmetic* mean and volatility drag
would pull the typical outcome far below it — at Ethereum's 85% volatility that
alone costs 36 points a year, teaching that crypto is a certain loss rather than
a wide spread of outcomes. Second, the drift is `log(1 + mu)` rather than `mu`,
since drift accumulates in log space; feeding in 0.08 directly compounds to
8.33%, so a table promising 8% would quietly deliver a third of a point more.
Verified over 4,000 ten-year runs: every asset's median compound return lands
within 0.5 points of its stated figure.

**News events are drift-neutralised.** Percentage shocks do not cancel — a -32%
crash followed by a +24% rally leaves you down 16%, not down 8%. Left uncorrected
that asymmetry silently drags every asset below its stated return, worst for the
assets with the biggest headlines. Each asset's expected log drag from events is
computed up front and removed from its drift, so events add drama without
rewriting the risk/return table students are reasoning about.

**Growth per year is a money-weighted return (IRR).** Dividing the final value by
total contributions would charge the deposit made in the final month with ten
years of growth it never had, understating the real rate by several points. The
app solves for the internal rate of return against the actual monthly cash flows
instead.

### Fees

Fees copy how NZ investing platforms really charge: a **$3 flat fee per trade
plus 0.5%**. The flat part is the point — invisible on a $5,000 trade and brutal
on a $50 one, which is exactly the trap a beginner making small frequent trades
falls into.

The benchmark pays the percentage fee but not the flat one, because it represents
an automatic monthly investment plan, and NZ platforms and KiwiSaver do not charge
per-trade fees on scheduled contributions. Charging $3 on a $50 auto-contribution
would hand the player a 6%-a-month head start that no real investor enjoys.

### The default seed

`classroom-2910` was chosen by scanning 6,000 seeds for a decade that is
representative rather than flattering: the world fund near its expectation, a real
crash to sit through, no absurd outcomes, and nothing falling further than crypto
actually has.

What makes it worth teaching is how it turns out. The boring NZX 50 fund returns
10.6% and beats almost everything. Nvidia, Xero and a2 Milk all finish
**negative**. Bitcoin manages 6.2%, below the world fund, after an 87% fall along
the way. And the best performer is Air New Zealand at 18.9% — the company with the
worst real history on the board, which no student would ever have picked.

Those figures describe the **ten-year** run, which is what the seed was selected
against. Stretch the same seed to 30 years and it keeps drawing from where it
left off, into a notably poor stretch: the world fund compounds at 3.1% over the
full thirty, below the bond fund. That is a legitimate draw rather than a bug —
one run is one roll of the dice — but if you are teaching a 30-year lesson about
long-horizon growth, pick a different seed rather than the default, or the market
will argue against you.

## Files

```
index.html            layout and copy
build.js              bundles everything into dist/market-lab.html
sw.js                 service worker; caches the app for offline use
manifest.webmanifest  name, icons and display mode for the installed app
icons/                app icons, generated by tools/make-icons.js
css/styles.css        design tokens, light/dark themes, responsive layout
js/rng.js             seeded PRNG and normal variates
js/market.js          assets, price engine, news events, inflation
js/portfolio.js       holdings, trades, fees, the benchmark, results
js/charts.js          canvas line chart and sparklines
js/ui.js              DOM rendering
js/app.js             bootstrap and event wiring
```

## Accessibility and design notes

Colour is organised in two tiers. Five category hues are spaced far apart around
the wheel (cyan, indigo, green, pink, orange), and each asset takes a step within
its category's hue. Category colour is what the allocation bar and the table
groups use, because five things can be told apart at a glance and sixteen cannot;
per-asset colour only ever appears next to that asset's own name, so the six
greens never have to be distinguished from each other in isolation.

The dark theme uses the same hues re-stepped for the dark surface rather than an
automatic inversion. Asset identity is always carried by a text label beside the
coloured mark, never by colour alone — including the risk badges, where the word
states the level and colour only reinforces it. The portfolio chart has a table
view alongside it so no value is reachable only by hovering, and the explanation
panel becomes a bottom sheet on small screens, closes on Escape, and returns
focus to whatever opened it.

## Check the historical figures before you teach from them

The `past` return on each asset is an approximate, rounded, long-run figure
included as teaching context, not as data. The fund-level numbers are the most
solid — the S&P/NZX 50 gross index has run at roughly 10% a year over the twenty
years to 2023 and about 9% over the last decade. The per-company figures are
rougher, and they are sensitive to exactly which start date you pick: a2 Milk's
long-run average looks completely different measured from 2015 versus 2018.

None of this affects the simulation, which runs on `mu` and never reads `past`.
But the numbers are on screen in front of students, so if you are teaching from
them, check them against a current source first and adjust the values in
`js/market.js`.

## A caveat worth passing on to students

Real markets are not this well behaved. Returns are not normally distributed,
crashes cluster, correlations rise exactly when diversification is most needed,
and no one knows any asset's expected return in advance. This is a model built
to make a handful of ideas visible in a single lesson, not a forecast. Any single
ten-year run is one roll of the dice — which is itself one of the more valuable
things it can demonstrate.
