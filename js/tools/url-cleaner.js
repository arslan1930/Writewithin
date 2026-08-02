/** @typedef {{
 *   trimSpaces: boolean,
 *   stripTrailingSlash: boolean,
 *   stripProtocol: boolean,
 *   stripWww: boolean,
 *   trimToRoot: boolean,
 *   lowercaseHost: boolean,
 *   dedupe: boolean,
 * }} CleanOpts */

/**
 * Each option is a simple on/off toggle:
 * - ON  → remove that part
 * - OFF → add that part
 */
/** @type {CleanOpts} */
export const DEFAULTS = {
  trimSpaces: true,
  stripTrailingSlash: true,
  stripProtocol: true,
  stripWww: true,
  trimToRoot: false,
  lowercaseHost: true,
  dedupe: true,
};

function splitLines(text) {
  return text
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(/[\t,]+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeUrl(s) {
  if (/^https?:\/\//i.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return true;
  return false;
}

/**
 * @param {string} out
 * @param {CleanOpts} opts
 */
function applySlashOption(out, opts) {
  if (!out) return out;

  out = out.replace(/([^:/])\/+(?=[?#]|$)/g, '$1');
  out = out.replace(/\/+$/g, '');

  if (opts.stripTrailingSlash) return out;

  const m = out.match(/^(https?:\/\/)?([^?#]*)([?#].*)?$/i);
  if (!m) return `${out}/`;
  const proto = m[1] || '';
  let body = (m[2] || '').replace(/\/+$/, '');
  const suffix = m[3] || '';
  if (body && !body.endsWith('/')) body += '/';
  return `${proto}${body}${suffix}`;
}

/**
 * @param {string} line
 * @param {CleanOpts} opts
 */
export function cleanUrl(line, opts = DEFAULTS) {
  let raw = line.trim();
  if (opts.trimSpaces) raw = raw.replace(/\s+/g, '');
  if (!raw) return { value: '', invalid: false };

  const invalid = !looksLikeUrl(raw);
  const hadProtocol = /^https?:\/\//i.test(raw);
  const originalProtocol = hadProtocol
    ? (raw.match(/^(https?):\/\//i)?.[1]?.toLowerCase() || 'https')
    : 'https';

  let url;
  try {
    url = new URL(hadProtocol ? raw : `https://${raw}`);
  } catch {
    let s = raw;
    if (opts.stripProtocol) {
      s = s.replace(/^https?:\/\//i, '');
    } else if (!/^https?:\/\//i.test(s)) {
      s = `https://${s}`;
    }

    if (opts.stripWww) {
      s = s.replace(/^(https?:\/\/)?www\./i, '$1');
    } else {
      s = s.replace(/^(https?:\/\/)?(?:www\.)?/i, (_, p) => `${p || ''}www.`);
    }

    if (opts.trimToRoot) {
      s = s.replace(/^(https?:\/\/[^/?#]+|[^/?#]+).*$/i, '$1');
    }
    return { value: applySlashOption(s, opts), invalid: true };
  }

  if (opts.lowercaseHost) url.hostname = url.hostname.toLowerCase();

  if (opts.stripWww) {
    url.hostname = url.hostname.replace(/^www\./i, '');
  } else if (!/^www\./i.test(url.hostname)) {
    url.hostname = `www.${url.hostname}`;
  }

  let hostTail;
  if (opts.trimToRoot) {
    hostTail = url.hostname;
  } else {
    let path = url.pathname || '/';
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '/') path = '';
    hostTail = `${url.hostname}${path}${url.search || ''}${url.hash || ''}`;
  }

  let out;
  if (opts.stripProtocol) {
    out = hostTail;
  } else {
    out = `${originalProtocol}://${hostTail}`;
  }

  return { value: applySlashOption(out, opts), invalid };
}

/**
 * @param {string} text
 * @param {CleanOpts} [opts]
 */
export function cleanBatch(text, opts = DEFAULTS) {
  const lines = splitLines(text);
  const cleaned = [];
  let invalid = 0;
  let duplicates = 0;
  const seen = new Set();

  for (const line of lines) {
    const { value, invalid: bad } = cleanUrl(line, opts);
    if (!value) continue;
    if (bad) invalid += 1;

    const key = value.toLowerCase();
    if (opts.dedupe) {
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
    }
    cleaned.push(value);
  }

  return {
    output: cleaned.join('\n'),
    stats: {
      input: lines.length,
      cleaned: cleaned.length,
      duplicates,
      invalid,
    },
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function onReady(fn) {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

export function mountUrlCleaner(root = document.getElementById('url-cleaner')) {
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-uc-input]');
  const output = root.querySelector('[data-uc-output]');
  const stats = root.querySelector('[data-uc-stats]');
  const toast = root.querySelector('[data-uc-toast]');
  const undoBtn = root.querySelector('[data-uc-undo]');
  const optionEls = [...root.querySelectorAll('[data-uc-opt]')];

  /** @type {CleanOpts} */
  const opts = { ...DEFAULTS };
  /** @type {{ input: string, opts: CleanOpts }[]} */
  const history = [];
  const HISTORY_MAX = 40;

  const showToast = (msg, tone = 'ok') => {
    if (!toast) return;
    clearTimeout(showToast._t);
    if (!msg) {
      toast.hidden = true;
      toast.textContent = '';
      toast.classList.remove('is-show');
      return;
    }
    toast.hidden = false;
    toast.textContent = msg;
    toast.dataset.tone = tone;
    toast.classList.remove('is-show');
    void toast.offsetWidth;
    toast.classList.add('is-show');
    showToast._t = setTimeout(() => {
      toast.classList.remove('is-show');
      toast.hidden = true;
    }, 1400);
  };

  const TOGGLE_MSG = {
    stripProtocol: { on: 'https:// removed', off: 'https:// added' },
    stripWww: { on: 'www. removed', off: 'www. added' },
    stripTrailingSlash: { on: 'Trailing / removed', off: 'Trailing / added' },
    trimSpaces: { on: 'Spaces removed', off: 'Spaces added' },
    trimToRoot: { on: 'Trimmed to root', off: 'Path added' },
  };

  const syncUndo = () => {
    if (!undoBtn) return;
    const canUndo = history.length > 0;
    undoBtn.disabled = !canUndo;
    if (canUndo) undoBtn.removeAttribute('disabled');
    else undoBtn.setAttribute('disabled', 'disabled');
    undoBtn.setAttribute('aria-disabled', canUndo ? 'false' : 'true');
    undoBtn.classList.toggle('is-ready', canUndo);
  };

  const snapshot = () => ({
    input: input?.value ?? '',
    opts: { ...opts },
  });

  const pushHistory = () => {
    history.push(snapshot());
    if (history.length > HISTORY_MAX) history.shift();
    syncUndo();
  };

  const syncOptions = () => {
    optionEls.forEach((el) => {
      const key = el.dataset.ucOpt;
      const on = !!opts[key];
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const resetOptions = () => {
    Object.assign(opts, DEFAULTS);
    syncOptions();
  };

  const clearFields = () => {
    if (input) input.value = '';
    if (output) output.value = '';
    if (stats) stats.textContent = '';
  };

  const run = () => {
    const raw = input?.value ?? '';
    if (!raw.trim()) {
      if (output) output.value = '';
      if (stats) stats.textContent = '';
      return;
    }
    const result = cleanBatch(raw, opts);
    if (output) output.value = result.output;
    if (stats) {
      const s = result.stats;
      const bits = [];
      if (s.cleaned) bits.push(`${s.cleaned} cleaned`);
      if (s.duplicates) bits.push(`${s.duplicates} duplicates removed`);
      if (s.invalid) bits.push(`${s.invalid} flagged`);
      stats.textContent = bits.join(' · ');
    }
  };

  const undo = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const prev = history.pop();
    syncUndo();
    if (!prev) {
      showToast('Nothing to undo', 'warn');
      return;
    }
    Object.assign(opts, prev.opts);
    if (input) input.value = prev.input;
    syncOptions();
    run();
    showToast('Undone');
  };

  syncOptions();
  syncUndo();
  run();

  // Snapshot once per typing/paste burst, then live-clean
  let typingSnapReady = true;
  const markTypingBurst = () => {
    if (!typingSnapReady) return;
    pushHistory();
    typingSnapReady = false;
  };
  input?.addEventListener('keydown', markTypingBurst);
  input?.addEventListener('paste', markTypingBurst);
  input?.addEventListener('input', run);
  input?.addEventListener('blur', () => {
    typingSnapReady = true;
  });

  optionEls.forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.ucOpt;
      if (!(key in opts)) return;
      pushHistory();
      opts[key] = !opts[key];
      syncOptions();
      run();
      const msg = TOGGLE_MSG[key];
      if (msg) showToast(opts[key] ? msg.on : msg.off);
    });
  });

  root.querySelector('[data-uc-copy]')?.addEventListener('click', async () => {
    const text = output?.value ?? '';
    if (!text) {
      showToast('Nothing to copy', 'warn');
      return;
    }
    const ok = await copyText(text);
    showToast(ok ? 'Text copied' : 'Copy failed', ok ? 'ok' : 'warn');
  });

  // Click + keyboard activation for the icon undo control
  undoBtn?.addEventListener('click', undo);
  undoBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') undo(e);
  });

  root.querySelector('[data-uc-clear]')?.addEventListener('click', () => {
    pushHistory();
    clearFields();
    showToast('Cleared');
    input?.focus();
  });

  root.querySelector('[data-uc-clear-all]')?.addEventListener('click', () => {
    pushHistory();
    clearFields();
    resetOptions();
    run();
    showToast('Cleared all');
    input?.focus();
  });
}

onReady(() => {
  mountUrlCleaner();
});
