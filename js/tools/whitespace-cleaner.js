/**
 * Whitespace Cleaner Suite — pure transforms + browser mount.
 * Deterministic pipeline. Text stays in the browser.
 */

import { stripInvisible, stripLeadingBom } from './shared/invisible.js';

/** @typedef {{
 *   stripBom: boolean,
 *   removeZeroWidthSafe: boolean,
 *   removeZeroWidthAggressive: boolean,
 *   replaceNbsp: boolean,
 *   normalizeUnicodeSpaces: boolean,
 *   trimLeading: boolean,
 *   trimTrailing: boolean,
 *   collapseSpaces: boolean,
 *   removeAllSpaces: boolean,
 *   tabsToSpaces: boolean,
 *   spacesToTabs: boolean,
 *   tabWidth: number,
 *   removeBlankLines: boolean,
 *   collapseBlankLines: boolean,
 *   fixPdfBreaks: boolean,
 *   eolMode: 'preserve'|'lf'|'crlf',
 *   showInvisible: boolean,
 * }} WsOpts */

/** @type {WsOpts} */
export const DEFAULTS = {
  stripBom: true,
  removeZeroWidthSafe: true,
  removeZeroWidthAggressive: false,
  replaceNbsp: true,
  normalizeUnicodeSpaces: true,
  trimLeading: false,
  trimTrailing: true,
  collapseSpaces: true,
  removeAllSpaces: false,
  tabsToSpaces: false,
  spacesToTabs: false,
  tabWidth: 4,
  removeBlankLines: false,
  collapseBlankLines: false,
  fixPdfBreaks: false,
  eolMode: 'preserve',
  showInvisible: false,
};

/** @type {Record<string, Partial<WsOpts>>} */
export const PRESETS = {
  email: {
    stripBom: true,
    removeZeroWidthSafe: true,
    removeZeroWidthAggressive: false,
    replaceNbsp: true,
    normalizeUnicodeSpaces: true,
    trimLeading: false,
    trimTrailing: true,
    collapseSpaces: true,
    removeAllSpaces: false,
    tabsToSpaces: false,
    spacesToTabs: false,
    removeBlankLines: false,
    collapseBlankLines: true,
    fixPdfBreaks: false,
    eolMode: 'preserve',
  },
  word: {
    stripBom: true,
    removeZeroWidthSafe: true,
    removeZeroWidthAggressive: false,
    replaceNbsp: true,
    normalizeUnicodeSpaces: true,
    trimLeading: false,
    trimTrailing: true,
    collapseSpaces: true,
    removeAllSpaces: false,
    tabsToSpaces: false,
    spacesToTabs: false,
    removeBlankLines: false,
    collapseBlankLines: true,
    fixPdfBreaks: false,
    eolMode: 'preserve',
  },
  pdf: {
    stripBom: true,
    removeZeroWidthSafe: true,
    removeZeroWidthAggressive: false,
    replaceNbsp: true,
    normalizeUnicodeSpaces: true,
    trimLeading: false,
    trimTrailing: true,
    collapseSpaces: true,
    removeAllSpaces: false,
    tabsToSpaces: false,
    spacesToTabs: false,
    removeBlankLines: false,
    collapseBlankLines: true,
    fixPdfBreaks: true,
    eolMode: 'preserve',
  },
  code: {
    stripBom: true,
    removeZeroWidthSafe: true,
    removeZeroWidthAggressive: false,
    replaceNbsp: true,
    normalizeUnicodeSpaces: false,
    trimLeading: false,
    trimTrailing: true,
    collapseSpaces: false,
    removeAllSpaces: false,
    tabsToSpaces: true,
    spacesToTabs: false,
    tabWidth: 4,
    removeBlankLines: false,
    collapseBlankLines: true,
    fixPdfBreaks: false,
    eolMode: 'lf',
  },
  cms: {
    stripBom: true,
    removeZeroWidthSafe: true,
    removeZeroWidthAggressive: false,
    replaceNbsp: true,
    normalizeUnicodeSpaces: true,
    trimLeading: true,
    trimTrailing: true,
    collapseSpaces: true,
    removeAllSpaces: false,
    tabsToSpaces: false,
    spacesToTabs: false,
    removeBlankLines: false,
    collapseBlankLines: true,
    fixPdfBreaks: false,
    eolMode: 'lf',
  },
};

const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Detect original EOL style from input (for preserve mode).
 * @param {string} text
 * @returns {'lf'|'crlf'|'cr'}
 */
export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const crOnly = (text.match(/\r/g) || []).length - crlf;
  const lfOnly = (text.match(/\n/g) || []).length - crlf;
  if (crlf >= lfOnly && crlf >= crOnly && crlf > 0) return 'crlf';
  if (crOnly > lfOnly && crOnly > 0) return 'cr';
  return 'lf';
}

/**
 * Reveal invisible characters for display (not for copy).
 * @param {string} text
 */
export function revealInvisible(text) {
  return [...text].map((ch) => {
    const code = ch.codePointAt(0);
    if (ch === ' ') return '·';
    if (ch === '\t') return '→';
    if (ch === '\n') return '↵\n';
    if (ch === '\r') return '␍';
    if (code === 0xa0) return '⍽';
    if (code === 0x200b) return '⟨ZWSP⟩';
    if (code === 0x200c) return '⟨ZWNJ⟩';
    if (code === 0x200d) return '⟨ZWJ⟩';
    if (code === 0x2060) return '⟨WJ⟩';
    if (code === 0xfeff) return '⟨BOM⟩';
    if (code != null && code >= 0x2000 && code <= 0x200a) return '␣';
    if (code === 0x202f || code === 0x205f || code === 0x3000) return '␣';
    return ch;
  }).join('');
}

/**
 * Deterministic whitespace clean pipeline.
 * @param {string} input
 * @param {Partial<WsOpts>} partial
 * @returns {{ output: string, display: string, stats: { before: number, after: number, removed: number, linesBefore: number, linesAfter: number } }}
 */
export function cleanWhitespace(input, partial = {}) {
  const opts = { ...DEFAULTS, ...partial };
  const before = input.length;
  const linesBefore = input.length ? input.replace(/\r\n?/g, '\n').split('\n').length : 0;
  const originalEol = detectEol(input);

  let text = input;

  // 1. Strip BOM from start
  if (opts.stripBom) {
    text = stripLeadingBom(text);
  }

  // 2. Zero-width
  if (opts.removeZeroWidthAggressive) {
    text = stripInvisible(text, 'aggressive');
  } else if (opts.removeZeroWidthSafe) {
    text = stripInvisible(text, 'safe');
  }

  // 3. NBSP + Unicode spaces → regular space
  if (opts.replaceNbsp) {
    text = text.replace(/\u00A0/g, ' ');
  }
  if (opts.normalizeUnicodeSpaces) {
    text = text.replace(UNICODE_SPACES, ' ');
  }

  // 4. Normalize EOL to LF for processing
  text = text.replace(/\r\n?/g, '\n');

  // 5. PDF hard-break merge: join lines that look mid-sentence
  if (opts.fixPdfBreaks) {
    text = text.replace(/([^\s.!?…:;"'”’)}\]])\n(?![ \t]*\n)(\p{Ll})/gu, '$1 $2');
  }

  // 6–10 operate per line / on whole text
  let lines = text.split('\n');

  if (opts.trimLeading || opts.trimTrailing) {
    lines = lines.map((line) => {
      let L = line;
      if (opts.trimLeading) L = L.replace(/^[ \t]+/, '');
      if (opts.trimTrailing) L = L.replace(/[ \t]+$/, '');
      return L;
    });
  }

  if (opts.collapseSpaces) {
    lines = lines.map((line) => line.replace(/[ \t]{2,}/g, ' '));
  }

  if (opts.removeAllSpaces) {
    lines = lines.map((line) => line.replace(/[ \t]+/g, ''));
  }

  if (opts.removeBlankLines) {
    lines = lines.filter((line) => line.trim() !== '');
  } else if (opts.collapseBlankLines) {
    const next = [];
    let blank = false;
    for (const line of lines) {
      const isBlank = line.trim() === '';
      if (isBlank) {
        if (!blank) next.push('');
        blank = true;
      } else {
        next.push(line);
        blank = false;
      }
    }
    lines = next;
  }

  // Tab ↔ space (mutually exclusive; spaces→tabs is leading indent only)
  const width = Math.max(1, Math.min(8, Number(opts.tabWidth) || 4));
  if (opts.tabsToSpaces && !opts.spacesToTabs) {
    const pad = ' '.repeat(width);
    lines = lines.map((line) => line.replace(/\t/g, pad));
  } else if (opts.spacesToTabs && !opts.tabsToSpaces) {
    lines = lines.map((line) => {
      const m = line.match(/^( *)(.*)$/);
      if (!m) return line;
      const spaces = m[1].length;
      const tabs = Math.floor(spaces / width);
      const rem = spaces % width;
      return '\t'.repeat(tabs) + ' '.repeat(rem) + m[2];
    });
  }

  text = lines.join('\n');

  // 11. EOL policy
  let eol = '\n';
  if (opts.eolMode === 'crlf') eol = '\r\n';
  else if (opts.eolMode === 'lf') eol = '\n';
  else if (originalEol === 'crlf') eol = '\r\n';
  else if (originalEol === 'cr') eol = '\r';

  if (eol !== '\n') {
    text = text.split('\n').join(eol);
  }

  const after = text.length;
  const linesAfter = text.length ? text.replace(/\r\n?/g, '\n').split('\n').length : 0;
  const display = opts.showInvisible ? revealInvisible(text) : text;

  return {
    output: text,
    display,
    stats: {
      before,
      after,
      removed: Math.max(0, before - after),
      linesBefore,
      linesAfter,
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
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
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

function msg(root, key, fallback) {
  const raw = root?.dataset?.[key];
  return (raw && raw.trim()) || fallback;
}

export function mountWhitespaceCleaner(root = document.getElementById('whitespace-cleaner')) {
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-ws-input]');
  const output = root.querySelector('[data-ws-output]');
  const stats = root.querySelector('[data-ws-stats]');
  const toast = root.querySelector('[data-ws-toast]');
  const undoBtn = root.querySelector('[data-ws-undo]');
  const tip = root.querySelector('[data-ws-preset-tip]');
  const optionEls = [...root.querySelectorAll('[data-ws-opt]')];
  const presetEls = [...root.querySelectorAll('[data-ws-preset]')];
  const tabWidthSel = root.querySelector('[data-ws-tab-width]');
  const eolSel = root.querySelector('[data-ws-eol]');

  /** @type {WsOpts} */
  const opts = { ...DEFAULTS };
  /** @type {{ input: string, opts: WsOpts }[]} */
  const history = [];
  const HISTORY_MAX = 40;
  let cleanedOutput = '';

  const showToast = (text, tone = 'ok') => {
    if (!toast) return;
    clearTimeout(showToast._t);
    if (!text) {
      toast.hidden = true;
      toast.textContent = '';
      toast.classList.remove('is-show');
      return;
    }
    toast.hidden = false;
    toast.textContent = text;
    toast.dataset.tone = tone;
    toast.classList.remove('is-show');
    void toast.offsetWidth;
    toast.classList.add('is-show');
    showToast._t = setTimeout(() => {
      toast.classList.remove('is-show');
      toast.hidden = true;
    }, 1600);
  };

  const syncUndo = () => {
    if (!undoBtn) return;
    const can = history.length > 0;
    undoBtn.disabled = !can;
    undoBtn.setAttribute('aria-disabled', can ? 'false' : 'true');
    undoBtn.classList.toggle('is-ready', can);
  };

  const snapshot = () => ({ input: input?.value ?? '', opts: { ...opts } });

  const pushHistory = () => {
    history.push(snapshot());
    if (history.length > HISTORY_MAX) history.shift();
    syncUndo();
  };

  const syncOptions = () => {
    optionEls.forEach((el) => {
      const key = el.dataset.wsOpt;
      if (!(key in opts)) return;
      const on = !!opts[key];
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (tabWidthSel) tabWidthSel.value = String(opts.tabWidth);
    if (eolSel) eolSel.value = opts.eolMode;
  };

  const run = () => {
    const raw = input?.value ?? '';
    if (!raw) {
      cleanedOutput = '';
      if (output) output.value = '';
      if (stats) stats.textContent = '';
      return;
    }
    const result = cleanWhitespace(raw, opts);
    cleanedOutput = result.output;
    if (output) output.value = result.display;
    if (stats) {
      const s = result.stats;
      const tpl = msg(root, 'statsTpl', '{before} → {after} chars · {removed} removed · {lines} lines');
      stats.textContent = tpl
        .replace('{before}', String(s.before))
        .replace('{after}', String(s.after))
        .replace('{removed}', String(s.removed))
        .replace('{lines}', String(s.linesAfter));
    }
  };

  const applyPreset = (name) => {
    const p = PRESETS[name];
    if (!p) return;
    pushHistory();
    Object.assign(opts, DEFAULTS, p);
    // keep showInvisible as user left it
    syncOptions();
    presetEls.forEach((el) => el.classList.toggle('is-active', el.dataset.wsPreset === name));
    if (tip) {
      tip.textContent = elTip(root, name);
      tip.hidden = !tip.textContent;
    }
    run();
    showToast(msg(root, 'presetApplied', 'Preset applied'));
  };

  function elTip(r, name) {
    const map = {
      email: r.dataset.tipEmail,
      word: r.dataset.tipWord,
      pdf: r.dataset.tipPdf,
      code: r.dataset.tipCode,
      cms: r.dataset.tipCms,
    };
    return (map[name] || '').trim();
  }

  syncOptions();
  syncUndo();
  run();

  let typingSnapReady = true;
  const markTypingBurst = () => {
    if (!typingSnapReady) return;
    pushHistory();
    typingSnapReady = false;
  };
  input?.addEventListener('keydown', markTypingBurst);
  input?.addEventListener('paste', markTypingBurst);
  input?.addEventListener('input', run);
  input?.addEventListener('blur', () => { typingSnapReady = true; });

  optionEls.forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.wsOpt;
      if (!(key in opts) || typeof opts[key] !== 'boolean') return;
      pushHistory();
      opts[key] = !opts[key];

      // Mutual exclusions
      if (key === 'tabsToSpaces' && opts.tabsToSpaces) opts.spacesToTabs = false;
      if (key === 'spacesToTabs' && opts.spacesToTabs) opts.tabsToSpaces = false;
      if (key === 'removeBlankLines' && opts.removeBlankLines) opts.collapseBlankLines = false;
      if (key === 'collapseBlankLines' && opts.collapseBlankLines) opts.removeBlankLines = false;
      if (key === 'removeZeroWidthAggressive' && opts.removeZeroWidthAggressive) {
        opts.removeZeroWidthSafe = true;
        showToast(msg(root, 'aggressiveWarn', 'Aggressive mode may affect Arabic/Indic joiners'), 'warn');
      }
      if (key === 'removeAllSpaces' && opts.removeAllSpaces) {
        opts.collapseSpaces = false;
      }

      syncOptions();
      run();
    });
  });

  presetEls.forEach((el) => {
    el.addEventListener('click', () => applyPreset(el.dataset.wsPreset || ''));
  });

  tabWidthSel?.addEventListener('change', () => {
    pushHistory();
    opts.tabWidth = Number(tabWidthSel.value) || 4;
    run();
  });

  eolSel?.addEventListener('change', () => {
    pushHistory();
    opts.eolMode = /** @type {WsOpts['eolMode']} */ (eolSel.value || 'preserve');
    run();
  });

  root.querySelector('[data-ws-copy]')?.addEventListener('click', async () => {
    if (!cleanedOutput) {
      showToast(msg(root, 'nothingCopy', 'Nothing to copy'), 'warn');
      return;
    }
    const ok = await copyText(cleanedOutput);
    showToast(ok ? msg(root, 'copied', 'Text copied') : msg(root, 'copyFail', 'Copy failed'), ok ? 'ok' : 'warn');
  });

  const undo = (e) => {
    e?.preventDefault?.();
    const prev = history.pop();
    syncUndo();
    if (!prev) {
      showToast(msg(root, 'nothingUndo', 'Nothing to undo'), 'warn');
      return;
    }
    Object.assign(opts, prev.opts);
    if (input) input.value = prev.input;
    syncOptions();
    run();
    showToast(msg(root, 'undone', 'Undone'));
  };

  undoBtn?.addEventListener('click', undo);

  root.querySelector('[data-ws-clear]')?.addEventListener('click', () => {
    pushHistory();
    if (input) input.value = '';
    cleanedOutput = '';
    if (output) output.value = '';
    if (stats) stats.textContent = '';
    showToast(msg(root, 'cleared', 'Cleared'));
    input?.focus();
  });

  root.querySelector('[data-ws-reset]')?.addEventListener('click', () => {
    pushHistory();
    Object.assign(opts, DEFAULTS);
    syncOptions();
    presetEls.forEach((el) => el.classList.remove('is-active'));
    if (tip) { tip.textContent = ''; tip.hidden = true; }
    run();
    showToast(msg(root, 'reset', 'Options reset'));
  });
}

onReady(() => {
  mountWhitespaceCleaner();
});
