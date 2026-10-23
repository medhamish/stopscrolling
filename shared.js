/*
 * shared.js
 * ---------
 * Small helpers used by the popup, the blocked page AND the background
 * service worker, so the "what counts as a valid domain" rules live in
 * exactly one place.
 *
 * It is a plain script (not an ES module) so it works everywhere:
 *   - <script src="shared.js"> in popup.html / blocked.html
 *   - importScripts('shared.js') in background.js
 * Everything is exposed on a single global: StopScrolling.
 */
(function (root) {
  'use strict';

  // The key under which the blocklist is stored in chrome.storage.local.
  const STORAGE_KEY = 'blockedDomains';

  // One DNS label: letters, digits and hyphens; no leading/trailing hyphen.
  const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  // Top-level domain: letters only (e.g. "com"), or punycode (e.g. "xn--p1ai").
  const TLD_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
  const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

  function fail(error) {
    return { ok: false, error: error };
  }

  /**
   * Turns whatever the user typed into a clean domain.
   *   "instagram.com"                      -> "instagram.com"
   *   "https://www.instagram.com/reels/"   -> "instagram.com"
   *   "  YouTube.COM "                     -> "youtube.com"
   * Returns { ok: true, domain } or { ok: false, error }.
   */
  function normalizeDomain(input) {
    if (typeof input !== 'string') return fail('Enter a website address.');

    let text = input.trim();
    if (!text) return fail('Type a website first, like instagram.com.');
    if (/\s/.test(text)) return fail("Website addresses can't contain spaces.");

    // If a scheme is present it must be http(s). Rejects chrome://, file://,
    // javascript: style input, etc. If there is no scheme, add one so the
    // built-in URL parser can do the hard work for us.
    const schemeMatch = text.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') {
        return fail('Only regular websites (http or https) can be blocked.');
      }
    } else {
      text = 'https://' + text;
    }

    let url;
    try {
      url = new URL(text);
    } catch (e) {
      return fail("That doesn't look like a valid website address.");
    }

    if (url.username || url.password) {
      return fail("Remove any login details and try again.");
    }

    // URL() already lowercases the host and converts international names
    // to punycode for us. Remove a trailing dot ("example.com.").
    let host = url.hostname.toLowerCase().replace(/\.$/, '');

    if (host.startsWith('[') || IPV4_PATTERN.test(host)) {
      return fail('Enter a website name, not an IP address.');
    }

    const labels = host.split('.');

    // "www.instagram.com" -> "instagram.com". Because we block subdomains
    // anyway, the bare domain covers www too. (Keep "www" if that's all
    // that would be left, e.g. "www.com".)
    if (labels.length > 2 && labels[0] === 'www') {
      labels.shift();
    }
    host = labels.join('.');

    if (labels.length < 2) {
      return fail('Include the full domain, like instagram.com.');
    }
    if (host.length > 253 || !labels.every(function (l) { return LABEL_PATTERN.test(l); })) {
      return fail("That doesn't look like a valid website address.");
    }
    if (!TLD_PATTERN.test(labels[labels.length - 1])) {
      return fail('That ending (like .com) does not look right.');
    }

    return { ok: true, domain: host };
  }

  /**
   * If `domain` is already blocked, or sits under a blocked domain
   * (e.g. "reels.instagram.com" under "instagram.com"), return that
   * blocked domain. Otherwise return null.
   * Note the "." in the endsWith check: "notinstagram.com" does NOT match.
   */
  function coveredBy(domain, list) {
    for (let i = 0; i < list.length; i++) {
      if (domain === list[i] || domain.endsWith('.' + list[i])) return list[i];
    }
    return null;
  }

  /**
   * Cleans a value read from storage: keeps only valid, unique domains,
   * sorted A-Z. Protects us from corrupted or hand-edited data.
   */
  function cleanList(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    raw.forEach(function (item) {
      const result = normalizeDomain(item);
      if (result.ok) seen.add(result.domain);
    });
    return Array.from(seen).sort();
  }

  /** Path (inside the extension) of the page shown for a blocked domain. */
  function blockedPagePath(domain) {
    return '/blocked.html?domain=' + encodeURIComponent(domain);
  }

  /**
   * Builds the declarativeNetRequest redirect rules for a list of domains.
   *
   * - "requestDomains" matches the domain AND all of its subdomains, but is
   *   a real domain-boundary match, so "instagram.com" never matches
   *   "notinstagram.com".
   * - Only "main_frame" requests (the page you navigate to) are redirected.
   *   Images/scripts are untouched, so nothing can redirect-loop.
   * - Rules only ever apply to http(s) requests, so chrome:// pages and
   *   this extension's own pages are never affected.
   * - Rule ids must be unique positive integers: we simply number them 1..n
   *   and rebuild the whole set on every change.
   */
  function buildRules(domains) {
    return domains.map(function (domain, index) {
      return {
        id: index + 1,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { extensionPath: blockedPagePath(domain) }
        },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['main_frame']
        }
      };
    });
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    normalizeDomain: normalizeDomain,
    coveredBy: coveredBy,
    cleanList: cleanList,
    blockedPagePath: blockedPagePath,
    buildRules: buildRules
  };

  root.StopScrolling = api;
  // Lets us unit-test this file with Node. Ignored inside Chrome.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
