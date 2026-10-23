/*
 * blocked.js
 * ----------
 * Fills in the blocked domain and wires up the "calm" button.
 *
 * The domain arrives in the URL (?domain=instagram.com). Anyone could type
 * anything into that URL, so we:
 *   1. run it through the same validator the popup uses, and
 *   2. show it with textContent (never innerHTML), so it can't inject HTML.
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const result = window.StopScrolling.normalizeDomain(params.get('domain') || '');

  if (result.ok) {
    document.getElementById('domain').textContent = result.domain;
  } // otherwise the placeholder text "This site" stays

  document.getElementById('leave').addEventListener('click', function () {
    // Prefer Chrome's New Tab page; fall back to a blank page if Chrome
    // refuses for any reason.
    chrome.tabs.update({ url: 'chrome://newtab/' }).catch(function () {
      window.location.replace('about:blank');
    });
  });
})();
