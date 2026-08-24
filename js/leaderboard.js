/* National / school / city / age-bracket competitive leaderboard.
 *
 * Separate track from the class leaderboard in js/share.js: this one needs an
 * account and a server because real prizes are on the line. Submission only
 * happens when a student is logged in and chose to enter a competition before
 * the run started - a normal practice run never touches the network.
 *
 * Trade quantities/prices come from state.trades (js/portfolio.js), where
 * every buy/sell is logged with the asset id, action, units, price and month
 * it happened - the same shape the backend's /api/games endpoints expect. */

(function (global) {
  'use strict';

  const $ = UI.$;

  // This game has no real calendar, only a month index - synthesize a
  // plausible date so the backend's Pydantic datetime field is satisfied.
  // The server only checks trade *prices* against history, not dates.
  function monthToTimestamp(month) {
    const base = Date.UTC(2020, 0, 1);
    const ms = month * 30 * 24 * 60 * 60 * 1000;
    return new Date(base + ms).toISOString();
  }

  function tradesForSubmission(state) {
    return state.trades.map(function (t) {
      return {
        symbol: t.symbol,
        action: t.action,
        quantity: t.quantity,
        price: t.price,
        timestamp: monthToTimestamp(t.month),
        fees: t.fees
      };
    });
  }

  let activeCompetitionId = null;

  function setActiveCompetition(id) {
    activeCompetitionId = id;
  }

  function getActiveCompetition() {
    return activeCompetitionId;
  }

  async function listCompetitions() {
    return Account.apiFetch('/api/leaderboard/competitions');
  }

  async function startGame(state) {
    const result = await Account.apiFetch('/api/games/start', {
      method: 'POST',
      body: JSON.stringify({
        seed: state.market.seed,
        starting_capital: state.cfg.startingCash,
        duration_years: state.market.months / Market.MONTHS_PER_YEAR,
        competition_id: activeCompetitionId
      })
    });
    return result.game_id;
  }

  /* Called once a run finishes. Silently does nothing if the student never
   * opted into a competition or isn't logged in - this is opt-in, not a
   * background upload of every practice run. */
  async function maybeSubmit(state, resultCode) {
    if (!Account.isConfigured() || !Account.isLoggedIn() || !activeCompetitionId) {
      return null;
    }
    const gameId = await startGame(state);
    return Account.apiFetch('/api/games/' + gameId + '/complete', {
      method: 'POST',
      body: JSON.stringify({
        trades: tradesForSubmission(state),
        client_reported_final_value: Portfolio.totalValue(state),
        result_code: resultCode
      })
    });
  }

  async function fetchLeaderboard(competitionId, scope, filters) {
    const params = new URLSearchParams(Object.assign({ scope: scope }, filters || {}));
    return Account.apiFetch('/api/leaderboard/' + competitionId + '?' + params.toString());
  }

  function renderRows(board) {
    if (!board.rows.length) {
      return '<p class="board-help">No entries yet for this scope.</p>';
    }
    let html =
      '<div class="data-table"><table><thead><tr><th scope="col">#</th><th scope="col">Name</th>' +
      '<th scope="col">School</th><th scope="col">Final value</th></tr></thead><tbody>' +
      board.rows
        .map(function (r) {
          return (
            '<tr><td>' +
            r.rank +
            '</td><td>' +
            String(r.display_name).replace(/</g, '&lt;') +
            '</td><td>' +
            String(r.school_name || '—').replace(/</g, '&lt;') +
            '</td><td><strong>' +
            UI.money(r.final_portfolio_value) +
            '</strong></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';

    if (board.you) {
      html +=
        '<p class="board-help">Your rank: #' + board.you.rank + ' (' + UI.money(board.you.final_portfolio_value) + ')</p>';
    }
    return html;
  }

  global.Leaderboard = {
    setActiveCompetition: setActiveCompetition,
    getActiveCompetition: getActiveCompetition,
    listCompetitions: listCompetitions,
    maybeSubmit: maybeSubmit,
    fetchLeaderboard: fetchLeaderboard,
    renderRows: renderRows
  };
})(window);
