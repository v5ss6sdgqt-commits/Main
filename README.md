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

`dist/market-lab.html` is the whole app inlined into one 267 KB file. Email it to
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

## For teachers

**[TEACHING.md](TEACHING.md)** has a ready-to-run 50-minute lesson, discussion
questions, a marking rubric and extension activities. Set-up is one line: send
students the link and tell them the seed.

## Class leaderboard, without accounts

Every comparable tool in this space — The Stock Market Game, HowTheMarketWorks,
PersonalFinanceLab — leans on a leaderboard, and the research behind them credits
the competition for the jump in engagement. All of them do it with accounts and a
server.

This app has neither and should not get either: it has to run offline on a
locked-down school Chromebook, and asking a teacher to create accounts for thirty
fifteen-year-olds is exactly the friction that stops a tool being used.

So each finished run produces a short **result code** like
`ML1-QC59-A-20-06Z8-01-9O`. Students read it out or paste it into a chat; the
teacher pastes the lot into the **Class leaderboard** box and gets a ranking. No
accounts, no network, nothing leaving anybody’s machine.

The code carries the seed, so the leaderboard can tell when two students did not
actually play the same market and says so — which turns a spoiled comparison into
a lesson about why the seed matters. A checksum catches typos and casual edits;
it is not security and does not pretend to be.

## Using it in a lesson

**Give the whole class the same seed.** The "Market seed" box drives every
random number in the simulation, so `classroom-4019` produces an identical ten
years of prices and news on every machine. Students face the same crash on the
same month, which turns "how did you do?" into a real comparison of decisions
rather than a comparison of luck.

**Press play once and let it run.** The simulation advances on its own and stops
only for a crash, where it asks the student what to do and then resumes on its
own. Ordinary headlines and recoveries scroll past in the news banner without
interrupting — stopping for those meant five presses of play to get through one
ten-year run. Speed is adjustable; the fast setting covers a decade in under half
a minute.

Some things that work well:

- Before starting, have everyone write down which asset they think will win. Then
  run the default seed, where bitcoin loses 9.6% a year and the best single
  company only just edges out a boring world fund.
- Have half the class buy and hold, and half trade every month, then compare the
  fees tile. The $3 flat fee does the teaching for you.
- Run it twice with the same seed and a different strategy each time.
- Change the seed and re-run the *same* strategy, to show how much of any single
  result was chance.
- Set the run to 20 years and watch how much harder the benchmark becomes to beat
  as the time horizon grows. The spread of outcomes narrows too: Ethereum's
  10th-percentile return is -23.5% a year over ten years and -14.8% over twenty.
  Time does not remove risk, but it does shrink it.

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

## The business cycle

The economy walks a loop — **expansion → overheating → recession → recovery** —
and everything else keys off it. It is what high-school economics actually
teaches, and wiring it in makes the rest of the app cohere: the news stops being
random and starts being caused, GDP becomes something to watch, and a sidebar
panel shows which phase the run is in with a live GDP figure and chart.

Average phase lengths are roughly matched to the real post-war record, so about
63% of months are expansion and only 11% recession. That is itself a lesson:
you spend most of your life in the good part, which is why sitting still wins.

The phase drives five things at once:

| | Expansion | Overheating | Recession | Recovery |
|---|---|---|---|---|
| GDP growth | +3.2% | +1.5% | **-1.8%** | +3.8% |
| Drift on risky assets | +2.5% | 0 | **-11%** | +7.5% |
| Volatility | 0.9x | 1.1x | **1.7x** | 1.25x |
| Correlation boost | 0 | +0.10 | **+0.35** | +0.15 |
| Inflation | 2.5% | 4.0% | 1.5% | 1.8% |

That correlation row is the one a plain random walk cannot produce. **In a
downturn everything risky starts moving together**, so a spread-out portfolio
protects you least exactly when you need it most. Bonds are the exception — they
carry a negative cycle beta, so they rise when shares fall, which is the whole
reason they earn a place.

The cycle is drift-neutralised the same way the news events are: weighted by how
long each phase lasts, the average drift adjustment is subtracted, so `mu` still
means exactly what the table says.

### Do the headlines actually move prices?

Yes, measurably. Across 300 runs, a month carrying a headline is **1.22x as
volatile** as one without. The news is not decoration.

## Dividends

Only the companies that really pay one do. Xero and Tesla have never paid a
dividend, a2 Milk has not paid a regular one, KiwiSaver funds reinvest
internally rather than distributing, and crypto has no profits to pay one from.
Meridian pays about 4.5%, the NZX 50 fund about 3.5%, Apple about 0.5%, Nvidia a
token amount.

They land **once a financial year, in cash**, and it is up to the student whether
to reinvest — which is a real decision with a real cost to getting it wrong.

The important mechanical point: `mu` is the *total* return, so the price is only
left to deliver `mu - dividend`. Otherwise the two would double-count and every
dividend payer would quietly beat its stated figure. A bond fund at 4.0% total
therefore grows its price at 0.2% and pays the rest out, which is what a real
bond fund does. Verified over 1,500 runs: price growth plus reinvested dividends
lands back on the stated total.

The benchmark reinvests its own dividends without a fee, which is what an
accumulating index fund does and keeps it comparable to the 8% the table
promises.

Tax is deliberately **not** modelled — it depends on how you invest and would
add a lot of complexity for little teaching value at this level.

## Volatility drag, and why the funds win

Each asset’s `mu` is its target **median** compound return, and volatile assets
have low ones — Ethereum 2.5%, Tesla 3.0%, against a world fund at 8.0%. That is
volatility drag: a plausible arithmetic mean minus sigma-squared-over-two lands
about there, and it matches the evidence that the median single stock
underperforms the index it sits in.

This was not always true here, and fixing it mattered. An earlier version gave
crypto and the hot tech names the *highest* expected returns, so the app’s own
glossary said "higher risk does not mean higher return" while the model quietly
paid a premium for risk. It also broke the AI ladder: the reckless opponent had
the best median of the three. With the recalibration, a good strategy now beats
it 70% of the time rather than 56%.

## Bounded tails

Plain geometric Brownian motion never stops: the spread grows with the square
root of time and nothing bounds it. Over thirty years that produced Ethereum at
a billion times its starting price in about a third of runs — visibly broken
rather than merely unlucky.

The drift now carries a gentle pull back toward each asset’s median path
(`MEAN_REVERSION = 0.12`/year). It is almost invisible over ten years, firm
enough to bound thirty, and pulls toward the trend rather than a fixed price so
the median is untouched. Runs containing an absurd price went from 2% / 15% / 35%
at ten, twenty and thirty years to **0% at all three**.

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

## Goals, crashes, and consequences

Three connected features carry most of the engagement, and they only work
together.

**A goal gives the numbers a reason to matter.** Students pick what they are
saving for — moving out, a first car, a big OE — and a progress bar sits under
the headline figure with a live "needs about 7.5% a year from here" that
recalculates every month. Without a target the app grows a number and there is no
reason to prefer one number to another.

Targets are priced off **the annual return they demand**, not off a fixed dollar
amount and not off a multiple of what the student pays in. Both of the simpler
options are broken by the same thing: compounding is not linear in time, so the
same target means something completely different at each run length.

Targets used to be a flat multiple of total contributions — 1.25x, 1.55x and
2.0x — and the difficulty that actually produced was this:

| | 5 years | 10 years | 20 years |
|---|---|---|---|
| Moving out | 7.0% a year | 4.3% a year | **2.1% a year** |
| First car | **12.5% a year** | 7.5% a year | **3.8% a year** |
| Big OE | **20.8% a year** | 11.2% a year | **5.9% a year** |

Over twenty years every goal sat below the world fund's own expectation and was
effectively automatic; over five years the Big OE needed 20.8% a year and could
not be reached by any strategy in this market. The feature only worked at the
ten-year length it was designed at.

Pricing by rate makes each tier mean the same thing everywhere — **4%** beats
cash and cannot be saved into, **8%** is roughly what a broad share fund is
expected to do, and **12%** needs a strong run or genuine risk-taking and often
will not happen. Cash at 3% cannot reach even the easiest one at any length,
which is the point: a goal you can save your way to teaches nothing.

**A crash stops the run and makes them choose.** When a recession or a crypto
collapse lands and the student actually holds investments, the simulation freezes
and shows the damage in dollars, with three buttons: sell everything, do nothing,
buy more — and, when the headline hit one corner of the market, a fourth:
*sell just the crypto*. "Sell everything" is the wrong instrument for a crypto
collapse, since it dumps the bonds and the world fund the news had nothing to do
with. The targeted option only appears when the student holds something in the
hit category and something outside it, so it is a real alternative rather than a
duplicate. This is the one decision in investing that genuinely separates
outcomes, and watching it scroll past in an auto-playing chart teaches nothing.
A crash also interrupts a skipped year rather than being discovered nine months
late.

No option is styled as the correct answer. Selling pays a flat fee per holding,
which is part of the lesson.

**The end screen says what it cost.** Every sale records the *units* that left,
not just the dollars, so the app can price those exact units at the final month
and report the real consequence: *"You got $1,476 for those units. Left alone
they would be worth $1,774 now — that one decision cost you $298."*

That is arithmetic on units the student actually sold, not a guess about a path
they did not take. Selling is not automatically punished either: when it genuinely
saved money the app says so, which is what makes the rest of it credible.

On the default seed, the three choices at the month-69 recession play out as
buying more ($9,083) ahead of holding ($8,886) ahead of panic selling ($8,788).
Nothing about that ordering is scripted — it falls out of the simulation.

## Comp mode: racing an AI

A tab at the top switches between **Solo mode** and **Comp mode**. In Comp mode
an AI opponent runs as a real second portfolio — same starting cash, same
monthly contributions, same prices, same fees — so the race is literally the
same simulation with a strategy in place of a student. Its line replaces the
benchmark on the chart, its moves are visible as it makes them, and the end
screen reports who won.

Strategies live in `js/opponents.js` and obey two rules: no lookahead (they may
read prices up to the current month and no further) and no free trades.

**The difficulty ladder is upside down on purpose.**

| Level | Who | What it does |
|---|---|---|
| Easy | The Chaser | Switches into the hottest asset every quarter, panics in every crash. Pays about $1,500 in fees over ten years. |
| Medium | Steady | 70/30 world fund and bonds, once a year, never sells. |
| Hard | Patient | Buys a world fund, adds yearly, buys *more* during crashes. Trades about 13 times in a decade. |

The hardest opponent is the one that does the least. A student who works up the
ladder discovers that the boring strategy is the strong one by losing to it,
which lands harder than being told.

Measured over 1,500 markets the medians order as intended — Chaser $9,194,
Steady $10,212, Patient $10,937 — but the Chaser is **streaky rather than simply
bad**. It concentrates in one volatile asset, so its 25th-to-75th percentile
range is roughly $4,300 to $21,900 and a good strategy only finishes ahead of it
about 56% of the time. That is honest rather than ideal, and worth telling
students: sometimes the reckless player wins, which is what makes recklessness
tempting.

### Why the Chaser is not worse

The price model sets each asset’s drift so its *median* compound return equals
`mu`. That was the right call for teaching — the textbook alternative made
Ethereum look like a guaranteed loss — but it implies a very high arithmetic
mean for volatile assets, so there is no **volatility drag**: combining several
volatile assets raises the median a lot, and concentrating in one is not
penalised the way it is in reality.

That is why no amount of tuning made the Chaser reliably bad, and why letting it
diversify across three hot picks made it markedly *better* (median $13,070,
beating Patient). Fixing it properly means specifying arithmetic means and
letting the median fall out as `m - sigma^2/2`, which would restore the real
penalty for volatility. That is a recalibration of all sixteen assets plus a new
default seed, so it is recorded as a known limitation rather than half-done.

## The opening briefing

First-time students used to land on a dense dashboard — sixteen assets, a goal
bar, an economy panel — with no idea what any of it was or where the money came
from. The first question anyone asked was *"why is my balance going up when I
have not bought anything?"*, which is the $50 monthly deposit doing exactly what
it is meant to.

Four short cards now open on a first visit: **your money**, **what you can buy**,
**what moves prices**, and **the catches**. The figures come from the live config
rather than being written into the copy, so changing the starting balance or the
fees updates the briefing too.

Card one exists mostly to head off that question before it can be asked. It says
plainly that the balance climbs every month whether or not you buy anything, and
that this is your own money arriving rather than profit.

It is skippable, shown once, and reachable again from **How it works** in the
header. Nobody should sit through it on their second run.

## The asset detail panel

Hovering a sparkline in the market table (or clicking it, or tabbing to it)
opens a panel with a readable chart of that asset, a stats row, and — the part
that matters — **what the company actually is and why it behaves the way it
does**.

Those two sentences per asset already existed in `js/market.js` as `what` and
`blurb`, and were being rendered nowhere. A student deciding whether to buy Air
New Zealand is better served by *"a famous company and a famously poor long-run
investment"* than by a 62-pixel squiggle.

It responds to hover, click and keyboard rather than hover alone, because
hover-only would be unusable on a phone and invisible to anyone navigating by
keyboard. A click pins it, so you can pin bitcoin and then advance the months to
watch it move — which is why an outside click only dismisses a pinned panel when
it lands on empty page rather than on a control.

The history column used to be hidden below 660px. It now shows as a full-width
tappable strip, since phones are exactly where a tiny sparkline is least
readable.

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

### The default seeds

There is one per run length, and the reason is worth stating plainly, because
for a while there was only one and it was wrong at two of the three lengths.

`classroom-4019` was chosen as a ten-year market, and it is a good one. Used as
a twenty-year market it was a disaster: it sits at the **97th percentile** of
markets by benchmark return, **every one of the sixteen assets beat its own
stated expected return**, and Nvidia returned 20.7% a year against a stated 4%.
A student who chose "20 years" was shown a decade and a half where the wildest
thing on the board won by miles — the exact opposite of what this app is for.
The fault was not the seed; it was reusing a seed picked at one horizon for
another, where a fixed random draw means something completely different.

Each of the three was chosen from 4,000 candidates on identical criteria: the
world fund lands near its stated 8%, no speculative asset beats it, bitcoin
loses to it, there is a fall of at least a quarter to sit through, the economy
passes through all four phases of the cycle, and the crash decisions are spread
across the run rather than bunched at one end.

| | 5 years<br>`classroom-3756` | 10 years<br>`classroom-4019` | 20 years<br>`classroom-3094` |
|---|---|---|---|
| Total World Fund | +7.4% a year | **+7.9%** a year | **+8.5%** a year |
| Bitcoin | **-32.3%** a year | **-9.6%** a year | +2.1% a year |
| Top of the board | KiwiSaver fund, +9.7% | Fisher & Paykel, +9.2% | S&P 500 fund, +8.5% |
| Bottom of the board | Bitcoin, -32.3% | Mainfreight, -10.5% | Tesla, -10.0% |
| Crash decisions | 3 | 3 | 6 |

What makes each of them worth teaching is the ending: the boring diversified
fund beat almost everything, the exciting bet lost money, and the best single
company only just edged out the fund while carrying several times the risk.
Nobody was rewarded for excitement, which is the entire point of the app.

Typing your own seed switches this off, as it should — the box wins, and
changing the run length never overwrites a seed a teacher has handed out.

## Files

```
index.html            layout and copy
build.js              bundles everything into dist/market-lab.html
sw.js                 service worker; caches the app for offline use
manifest.webmanifest  name, icons and display mode for the installed app
icons/                app icons and the link preview card, from tools/make-icons.js
tests/                Playwright suites; see tests/README.md
css/styles.css        design tokens, light/dark themes, responsive layout
js/rng.js             seeded PRNG and normal variates
js/market.js          assets, price engine, news events, inflation
js/portfolio.js       holdings, trades, fees, the benchmark, results
js/goals.js           goal targets and the required-return maths
js/opponents.js       the AI opponents and their strategies
js/asset-panel.js     the hover-to-expand asset detail panel
js/intro.js           the four-card opening briefing
js/share.js           result codes and the class leaderboard
js/charts.js          canvas line chart and sparklines
js/ui.js              DOM rendering
js/app.js             bootstrap and event wiring
```

Nothing in `tests/` or `tools/` ships. Both need Playwright; the app itself
needs nothing at all. `node tests/run.js` runs the lot — see
[tests/README.md](tests/README.md), which also lists the bugs that reached a
working build and the suites now guarding against them.

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
