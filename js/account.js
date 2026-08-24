/* National leaderboard account: signup/login against the MarketLab backend.
 *
 * Deliberately separate from Share (js/share.js) and the class leaderboard -
 * that system stays account-free and offline by design. This module is only
 * loaded into the parts of the page that talk to the backend, and every call
 * fails soft: no backend configured, or the network is down, degrades to
 * "national leaderboard unavailable" rather than breaking the offline game.
 *
 * API_BASE is unset until a real backend is deployed - see the MarketLab
 * leaderboard PRD for hosting status. Set it below once that's decided. */

(function (global) {
  'use strict';

  const API_BASE = 'https://marketlab-backend.onrender.com';
  const TOKEN_KEY = 'marketlab_token';
  const USER_KEY = 'marketlab_user';

  function isConfigured() {
    return !!API_BASE;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function apiFetch(path, opts) {
    if (!isConfigured()) {
      throw new Error('The national leaderboard is not available yet.');
    }
    const options = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* no JSON body */
    }
    if (!res.ok) {
      const detail = (body && body.detail) || res.statusText || 'Request failed';
      throw new Error(detail);
    }
    return body;
  }

  async function signup(data) {
    const result = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    setSession(result.access_token, result.user);
    return result.user;
  }

  async function login(username, password) {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password })
    });
    setSession(result.access_token, result.user);
    return result.user;
  }

  global.Account = {
    isConfigured: isConfigured,
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    getToken: getToken,
    signup: signup,
    login: login,
    logout: logout,
    apiFetch: apiFetch
  };
})(window);
