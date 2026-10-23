/*
 * background.js  (MV3 service worker)
 * -----------------------------------
 * Job: keep Chrome's dynamic declarativeNetRequest rules in sync with the
 * blocklist saved in chrome.storage.local.
 *
 * Chrome itself enforces the rules, so blocking keeps working even when
 * this service worker is asleep. The worker only wakes up to update rules.
 */
importScripts('shared.js');

const { STORAGE_KEY, cleanList, buildRules } = self.StopScrolling;

// Rule updates are queued one after another. Two updates running at the
// same time could both try to add rule id 1 and one would fail.
let queue = Promise.resolve();

function syncRules() {
  // Run doSync after the previous job, whether it succeeded or failed.
  queue = queue.then(doSync, doSync);
  return queue;
}

/** Replace ALL dynamic rules with ones built from the stored blocklist. */
async function doSync() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const domains = cleanList(stored[STORAGE_KEY]);

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  // Remove + add happen in one atomic call: no moment with half a blocklist.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(function (rule) { return rule.id; }),
    addRules: buildRules(domains)
  });
  return domains.length;
}

function syncAndLog(reason) {
  syncRules().catch(function (err) {
    console.error('[Stop Scrolling] Could not sync rules (' + reason + '):', err);
  });
}

// NOTE: listeners must be registered at the top level of a service worker
// so Chrome can wake the worker for these events.

// First install, extension update, or Chrome update: make sure rules match.
chrome.runtime.onInstalled.addListener(function () { syncAndLog('installed'); });

// Chrome started: dynamic rules persist, but re-syncing is cheap insurance.
chrome.runtime.onStartup.addListener(function () { syncAndLog('startup'); });

// Any change to the saved blocklist -> update the rules.
chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName === 'local' && changes[STORAGE_KEY]) syncAndLog('storage changed');
});

// The popup asks us to sync and waits for the answer, so it can show an
// error if Chrome rejects the rules.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id) return; // ignore other extensions
  if (!message || message.type !== 'SYNC_RULES') return;

  syncRules()
    .then(function (count) { sendResponse({ ok: true, count: count }); })
    .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });

  return true; // keep the message channel open for the async reply
});
