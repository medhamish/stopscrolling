/*
 * popup.js
 * --------
 * Popup logic: add / remove sites and show friendly messages.
 *
 * Two modes:
 *   - Extension: uses chrome.storage.local + the background worker.
 *   - Preview (e.g. VS Code Live Server): uses localStorage; nothing is
 *     actually blocked, it only demonstrates the interface.
 *
 * Flow when the blocklist changes:
 *   1. save the new list to chrome.storage.local (or localStorage in preview)
 *   2. ask the background worker to rebuild the blocking rules
 *   3. if either step fails, restore the previous list and show an error
 *
 * Safety note: every piece of text is put on the page with textContent
 * (never innerHTML), so a weird domain can't inject HTML.
 */
(function () {
  'use strict';

  const SS = window.StopScrolling;

  // Sites offered as one-click suggestions (hidden once already blocked).
  const QUICK_PICKS = ['instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com', 'x.com', 'facebook.com'];

  const form = document.getElementById('add-form');
  const input = document.getElementById('site-input');
  const addBtn = document.getElementById('add-btn');
  const messageEl = document.getElementById('message');
  const quickSection = document.getElementById('quick-section');
  const quickPicksEl = document.getElementById('quick-picks');
  const listEl = document.getElementById('site-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('count');
  const previewNoteEl = document.getElementById('preview-note');

  let blocklist = [];   // current list of blocked domains (sorted)
  let busy = false;     // true while saving, prevents double clicks
  let messageTimer = null;

  // ---------- Messages ----------

  function showMessage(text, kind) {
    clearTimeout(messageTimer);
    messageEl.textContent = text;
    messageEl.className = 'message ' + kind; // "success" or "error"
    messageEl.hidden = false;
    input.classList.toggle('invalid', kind === 'error');
    // Errors stay a bit longer so they can be read.
    messageTimer = setTimeout(hideMessage, kind === 'error' ? 5000 : 3000);
  }

  function hideMessage() {
    messageEl.hidden = true;
    input.classList.remove('invalid');
  }

  // ---------- Storage + background ----------

  // Are we running as an installed extension (popup opened from the toolbar)?
  // On a normal web page such as Live Server at 127.0.0.1:5500, `chrome.storage`
  // and `chrome.runtime.id` do not exist, so we fall back to PREVIEW MODE:
  // the blocklist is kept in localStorage and nothing is really blocked.
  const IS_EXTENSION = !!(
    typeof chrome !== 'undefined' &&
    chrome.storage && chrome.storage.local &&
    chrome.runtime && chrome.runtime.id &&
    typeof chrome.runtime.sendMessage === 'function'
  );

  // localStorage can throw (blocked cookies/site data), so keep an in-memory
  // copy as a last resort. The list then lasts until the page is reloaded.
  let previewMemory = [];

  function previewRead() {
    try {
      const raw = localStorage.getItem(SS.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('[Stop Scrolling] Preview: localStorage unavailable, using memory.', err);
      return previewMemory;
    }
  }

  function previewWrite(list) {
    previewMemory = list.slice();
    try {
      localStorage.setItem(SS.STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('[Stop Scrolling] Preview: could not write localStorage.', err);
    }
  }

  async function loadList() {
    if (!IS_EXTENSION) return SS.cleanList(previewRead());
    const stored = await chrome.storage.local.get(SS.STORAGE_KEY);
    return SS.cleanList(stored[SS.STORAGE_KEY]);
  }

  async function saveList(list) {
    if (!IS_EXTENSION) {
      previewWrite(list);
      return;
    }
    await chrome.storage.local.set({ [SS.STORAGE_KEY]: list });
  }

  // Ask the background worker to update the rules and wait for its answer.
  // In preview mode there is no background worker and no real blocking.
  async function requestSync() {
    if (!IS_EXTENSION) return;
    const response = await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || 'No response from the background worker.');
    }
  }

  /** Save + sync. Returns true on success; restores the old list on failure. */
  async function commit(newList) {
    const previous = blocklist;
    try {
      await saveList(newList);
      await requestSync();
      blocklist = newList;
      return true;
    } catch (err) {
      console.error('[Stop Scrolling] Could not update the blocklist:', err);
      try {
        await saveList(previous);
        await requestSync();
      } catch (restoreErr) {
        console.error('[Stop Scrolling] Could not restore the previous list:', restoreErr);
      }
      return false;
    }
  }

  // ---------- Actions ----------

  async function addSite(rawInput) {
    if (busy) return;

    const result = SS.normalizeDomain(rawInput);
    if (!result.ok) {
      showMessage(result.error, 'error');
      input.focus();
      return;
    }

    const domain = result.domain;
    const existing = SS.coveredBy(domain, blocklist);
    if (existing) {
      showMessage(
        existing === domain
          ? domain + ' is already blocked.'
          : domain + ' is already covered by ' + existing + '.',
        'error'
      );
      input.focus();
      return;
    }

    setBusy(true);
    const ok = await commit(blocklist.concat(domain).sort());
    setBusy(false);

    if (ok) {
      input.value = '';
      render();
      showMessage('Blocked ' + domain + ' and its subdomains.', 'success');
    } else {
      showMessage("Couldn't block " + domain + '. Please try again.', 'error');
    }
  }

  async function removeSite(domain) {
    if (busy) return;

    setBusy(true);
    const ok = await commit(blocklist.filter(function (d) { return d !== domain; }));
    setBusy(false);

    render();
    if (ok) {
      showMessage('Removed ' + domain + '.', 'success');
    } else {
      showMessage("Couldn't remove " + domain + '. Please try again.', 'error');
    }
  }

  function setBusy(value) {
    busy = value;
    addBtn.disabled = value;
    document.querySelectorAll('.btn-remove, .chip').forEach(function (btn) {
      btn.disabled = value;
    });
  }

  // ---------- Rendering ----------

  function render() {
    // Count
    countEl.textContent = String(blocklist.length);
    countEl.setAttribute('aria-label', blocklist.length + ' blocked sites');

    // List
    listEl.textContent = '';
    blocklist.forEach(function (domain) {
      const item = document.createElement('li');
      item.className = 'site-item';

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = domain.charAt(0);

      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = domain;
      name.title = domain;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + domain);
      remove.addEventListener('click', function () { removeSite(domain); });

      item.append(avatar, name, remove);
      listEl.appendChild(item);
    });

    // Empty state
    emptyEl.hidden = blocklist.length > 0;

    // Quick picks: only the ones not already covered by the blocklist
    quickPicksEl.textContent = '';
    const available = QUICK_PICKS.filter(function (d) { return !SS.coveredBy(d, blocklist); });
    available.forEach(function (domain) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = domain;
      chip.setAttribute('aria-label', 'Block ' + domain);
      chip.addEventListener('click', function () { addSite(domain); });
      quickPicksEl.appendChild(chip);
    });
    quickSection.hidden = available.length === 0;
  }

  // ---------- Start ----------

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    addSite(input.value);
  });

  // Clear the red error outline as soon as the user edits the text.
  input.addEventListener('input', function () { input.classList.remove('invalid'); });

  (async function init() {
    try {
      blocklist = await loadList();
      // Make sure the rules match what we just loaded (e.g. after a crash).
      requestSync().catch(function (err) {
        console.warn('[Stop Scrolling] Initial sync failed:', err);
      });
    } catch (err) {
      console.error('[Stop Scrolling] Could not read saved settings:', err);
      blocklist = [];
      showMessage("Couldn't load your saved list. Try reopening the popup.", 'error');
    }
    if (!IS_EXTENSION) previewNoteEl.hidden = false;
    render();
    input.focus();
  })();
})();
