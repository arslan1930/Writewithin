/**
 * Line Tools Suite — pure transforms + browser mount.
 * Deterministic pipeline. Text stays in the browser.
 */

/** @typedef {{
 *   whitespaceAsBlank: boolean,
 *   removeBlankLines: boolean,
 *   filterMode: 'none'|'remove'|'keep',
 *   filterText: string,
 *   filterCaseSensitive: boolean,
 *   uniqueLines: boolean,
 *   sortMode: 'none'|'asc'|'desc',
 *   sortIgnoreCase: boolean,
 *   reverseLines: boolean,
 *   joinMode: boolean,
 *   joinSeparator: string,
 *   removeLineBreaks: boolean,
 *   splitMode: 'none'|'sentences'|'width'|'custom',
 *   splitWidth: number,
 *   splitCustom: string,
 *   addLineBreaks: boolean,
 *   addBreakWidth: number,
 *   eolMode: 'preserve'|'lf'|'crlf',
 * }} LtOpts */

/** @type {LtOpts} */
export const DEFAULTS = {
  whitespaceAsBlank: false,
  removeBlankLines: false,
  filterMode: 'none',
  filterText: '',
  filterCaseSensitive: false,
  uniqueLines: false,
  sortMode: 'none',
  sortIgnoreCase: true,
  reverseLines: false,
  joinMode: false,
  joinSeparator: ' ',
  removeLineBreaks: false,
  splitMode: 'none',
  splitWidth: 80,
  splitCustom: '',
  addLineBreaks: false,
  addBreakWidth: 80,
  eolMode: 'preserve',
};

/** @type {Record<string, Partial<LtOpts>>} */
export const PRESETS = {
  email: {
    whitespaceAsBlank: true,
    removeBlankLines: true,
    uniqueLines: false,
    sortMode: 'none',
    reverseLines: false,
    joinMode: false,
    removeLineBreaks: false,
    splitMode: 'none',
    addLineBreaks: false,
    filterMode: 'none',
    eolMode: 'preserve',
  },
  list: {
    whitespaceAsBlank: true,
    removeBlankLines: true,
    uniqueLines: true,
    sortMode: 'asc',
    sortIgnoreCase: true,
    reverseLines: false,
    joinMode: false,
    removeLineBreaks: false,
    splitMode: 'none',
    addLineBreaks: false,
    filterMode: 'none',
    eolMode: 'lf',
  },
  csv: {
    whitespaceAsBlank: true,
    removeBlankLines: true,
    uniqueLines: true,
    sortMode: 'none',
    reverseLines: false,
    joinMode: false,
    removeLineBreaks: false,
    splitMode: 'none',
    addLineBreaks: false,
    filterMode: 'none',
    eolMode: 'lf',
  },
  prose: {
    whitespaceAsBlank: false,
    removeBlankLines: false,
    uniqueLines: false,
    sortMode: 'none',
    reverseLines: false,
    joinMode: false,
    removeLineBreaks: true,
    splitMode: 'none',
    addLineBreaks: true,
    addBreakWidth: 72,
    filterMode: 'none',
    eolMode: 'preserve',
  },
  log: {
    whitespaceAsBlank: true,
    removeBlankLines: true,
    uniqueLines: false,
    sortMode: 'none',
    reverseLines: false,
    joinMode: false,
    removeLineBreaks: false,
    splitMode: 'none',
    addLineBreaks: false,
    filterMode: 'keep',
    filterCaseSensitive: false,
    eolMode: 'preserve',
  },
};

export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const crOnly = (text.match(/\r/g) || []).length - crlf;
  const lfOnly = (text.match(/\n/g) || []).length - crlf;
  if (crlf >= lfOnly && crlf >= crOnly && crlf > 0) return 'crlf';
  if (crOnly > lfOnly && crOnly > 0) return 'cr';
  return 'lf';
}

function isBlankLine(line, whitespaceAsBlank) {
  if (line === '') return true;
  return whitespaceAsBlank && line.trim() === '';
}

/**
 * @param {string} input
 * @param {Partial<LtOpts>} partial
 */
export function cleanLines(input, partial = {}) {
  const opts = { ...DEFAULTS, ...partial };
  const before = input.length;
  const originalEol = detectEol(input);
  let text = input.replace(/\r\n?/g, '\n');
  let lines = text.length ? text.split('\n') : [];
  const linesBefore = lines.length;

  // 2–3 blank handling
  if (opts.removeBlankLines) {
    lines = lines.filter((line) => !isBlankLine(line, opts.whitespaceAsBlank));
  }

  // 4 filter
  const needle = opts.filterText || '';
  if (opts.filterMode !== 'none' && needle !== '') {
    const hay = opts.filterCaseSensitive ? needle : needle.toLowerCase();
    lines = lines.filter((line) => {
      const src = opts.filterCaseSensitive ? line : line.toLowerCase();
      const hit = src.includes(hay);
      return opts.filterMode === 'keep' ? hit : !hit;
    });
  }

  // 5 stable unique
  if (opts.uniqueLines) {
    const seen = new Set();
    const next = [];
    for (const line of lines) {
      if (seen.has(line)) continue;
      seen.add(line);
      next.push(line);
    }
    lines = next;
  }

  // 6 sort / reverse (sort wins over reverse if both somehow set — UI excludes)
  if (opts.sortMode === 'asc' || opts.sortMode === 'desc') {
    const mul = opts.sortMode === 'asc' ? 1 : -1;
    lines = [...lines].sort((a, b) => {
      const aa = opts.sortIgnoreCase ? a.toLowerCase() : a;
      const bb = opts.sortIgnoreCase ? b.toLowerCase() : b;
      if (aa < bb) return -1 * mul;
      if (aa > bb) return 1 * mul;
      return 0;
    });
  } else if (opts.reverseLines) {
    lines = [...lines].reverse();
  }

  // 7 join / remove breaks / split / add breaks
  if (opts.joinMode || opts.removeLineBreaks) {
    const sep = opts.removeLineBreaks && !opts.joinMode ? ' ' : (opts.joinSeparator ?? ' ');
    text = lines.join(sep);
    lines = [text];
  }

  if (opts.splitMode !== 'none') {
    text = lines.join('\n');
    if (opts.splitMode === 'sentences') {
      lines = text
        .split(/(?<=[.!?…])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (opts.splitMode === 'width') {
      const w = Math.max(1, Number(opts.splitWidth) || 80);
      const chunks = [];
      const flat = text.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
      for (let i = 0; i < flat.length; i += w) chunks.push(flat.slice(i, i + w));
      lines = chunks.length ? chunks : [];
    } else if (opts.splitMode === 'custom') {
      const delim = opts.splitCustom || '\n';
      lines = text.split(delim);
    }
  }

  if (opts.addLineBreaks && opts.splitMode === 'none' && !opts.joinMode && !opts.removeLineBreaks) {
    const w = Math.max(1, Number(opts.addBreakWidth) || 80);
    const flat = lines.join(' ').replace(/[ \t]+/g, ' ').trim();
    const chunks = [];
    let rest = flat;
    while (rest.length > w) {
      let cut = rest.lastIndexOf(' ', w);
      if (cut < w * 0.5) cut = w;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    lines = chunks;
  }

  text = lines.join('\n');

  let eol = '\n';
  if (opts.eolMode === 'crlf') eol = '\r\n';
  else if (opts.eolMode === 'lf') eol = '\n';
  else if (originalEol === 'crlf') eol = '\r\n';
  else if (originalEol === 'cr') eol = '\r';
  if (eol !== '\n') text = text.split('\n').join(eol);

  const after = text.length;
  const linesAfter = text.length ? text.replace(/\r\n?/g, '\n').split('\n').length : 0;

  return {
    output: text,
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
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function onReady(fn) {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

function msg(root, key, fallback) {
  const raw = root?.dataset?.[key];
  return (raw && raw.trim()) || fallback;
}

export function mountLineTools(root = document.getElementById('line-tools')) {
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-lt-input]');
  const output = root.querySelector('[data-lt-output]');
  const stats = root.querySelector('[data-lt-stats]');
  const toast = root.querySelector('[data-lt-toast]');
  const undoBtn = root.querySelector('[data-lt-undo]');
  const tip = root.querySelector('[data-lt-preset-tip]');
  const filterInput = root.querySelector('[data-lt-filter-text]');
  const joinSep = root.querySelector('[data-lt-join-sep]');
  const splitWidth = root.querySelector('[data-lt-split-width]');
  const splitCustom = root.querySelector('[data-lt-split-custom]');
  const addWidth = root.querySelector('[data-lt-add-width]');
  const eolSel = root.querySelector('[data-lt-eol]');
  const optionEls = [...root.querySelectorAll('[data-lt-opt]')];
  const modeEls = [...root.querySelectorAll('[data-lt-mode]')];
  const presetEls = [...root.querySelectorAll('[data-lt-preset]')];

  /** @type {LtOpts} */
  const opts = { ...DEFAULTS };
  /** @type {{ input: string, opts: LtOpts }[]} */
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
      const key = el.dataset.ltOpt;
      if (!(key in opts)) return;
      const on = !!opts[key];
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    modeEls.forEach((el) => {
      const group = el.dataset.ltModeGroup;
      const val = el.dataset.ltMode;
      let active = false;
      if (group === 'filter') active = opts.filterMode === val;
      if (group === 'sort') active = opts.sortMode === val;
      if (group === 'split') active = opts.splitMode === val;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (filterInput) filterInput.value = opts.filterText;
    if (joinSep) joinSep.value = opts.joinSeparator;
    if (splitWidth) splitWidth.value = String(opts.splitWidth);
    if (splitCustom) splitCustom.value = opts.splitCustom;
    if (addWidth) addWidth.value = String(opts.addBreakWidth);
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
    const result = cleanLines(raw, opts);
    cleanedOutput = result.output;
    if (output) output.value = result.output;
    if (stats) {
      const s = result.stats;
      const tpl = msg(root, 'statsTpl', '{before} → {after} chars · {linesBefore} → {linesAfter} lines');
      stats.textContent = tpl
        .replace('{before}', String(s.before))
        .replace('{after}', String(s.after))
        .replace('{removed}', String(s.removed))
        .replace('{linesBefore}', String(s.linesBefore))
        .replace('{linesAfter}', String(s.linesAfter))
        .replace('{lines}', String(s.linesAfter));
    }
  };

  const applyPreset = (name) => {
    const p = PRESETS[name];
    if (!p) return;
    pushHistory();
    const keepFilter = opts.filterText;
    Object.assign(opts, DEFAULTS, p);
    if (name === 'log' && !opts.filterText) opts.filterText = keepFilter || opts.filterText;
    syncOptions();
    presetEls.forEach((el) => el.classList.toggle('is-active', el.dataset.ltPreset === name));
    if (tip) {
      const map = {
        email: root.dataset.tipEmail,
        list: root.dataset.tipList,
        csv: root.dataset.tipCsv,
        prose: root.dataset.tipProse,
        log: root.dataset.tipLog,
      };
      tip.textContent = (map[name] || '').trim();
      tip.hidden = !tip.textContent;
    }
    run();
    showToast(msg(root, 'presetApplied', 'Preset applied'));
  };

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
      const key = el.dataset.ltOpt;
      if (!(key in opts) || typeof opts[key] !== 'boolean') return;
      pushHistory();
      opts[key] = !opts[key];

      if (key === 'joinMode' && opts.joinMode) {
        opts.removeLineBreaks = false;
        opts.splitMode = 'none';
        opts.addLineBreaks = false;
      }
      if (key === 'removeLineBreaks' && opts.removeLineBreaks) {
        opts.joinMode = false;
        opts.splitMode = 'none';
        opts.addLineBreaks = false;
      }
      if (key === 'addLineBreaks' && opts.addLineBreaks) {
        opts.joinMode = false;
        opts.removeLineBreaks = false;
        opts.splitMode = 'none';
      }
      if (key === 'reverseLines' && opts.reverseLines) opts.sortMode = 'none';
      if (key === 'uniqueLines' && opts.uniqueLines) {
        /* no-op */
      }

      syncOptions();
      run();
    });
  });

  modeEls.forEach((el) => {
    el.addEventListener('click', () => {
      const group = el.dataset.ltModeGroup;
      const val = el.dataset.ltMode;
      pushHistory();
      if (group === 'filter') {
        opts.filterMode = /** @type {LtOpts['filterMode']} */ (
          opts.filterMode === val ? 'none' : val
        );
      }
      if (group === 'sort') {
        opts.sortMode = /** @type {LtOpts['sortMode']} */ (
          opts.sortMode === val ? 'none' : val
        );
        if (opts.sortMode !== 'none') opts.reverseLines = false;
      }
      if (group === 'split') {
        opts.splitMode = /** @type {LtOpts['splitMode']} */ (
          opts.splitMode === val ? 'none' : val
        );
        if (opts.splitMode !== 'none') {
          opts.joinMode = false;
          opts.removeLineBreaks = false;
          opts.addLineBreaks = false;
        }
      }
      syncOptions();
      run();
    });
  });

  presetEls.forEach((el) => {
    el.addEventListener('click', () => applyPreset(el.dataset.ltPreset || ''));
  });

  filterInput?.addEventListener('input', () => {
    opts.filterText = filterInput.value;
    run();
  });
  joinSep?.addEventListener('input', () => {
    opts.joinSeparator = joinSep.value;
    run();
  });
  splitWidth?.addEventListener('change', () => {
    pushHistory();
    opts.splitWidth = Number(splitWidth.value) || 80;
    run();
  });
  splitCustom?.addEventListener('input', () => {
    opts.splitCustom = splitCustom.value;
    run();
  });
  addWidth?.addEventListener('change', () => {
    pushHistory();
    opts.addBreakWidth = Number(addWidth.value) || 80;
    run();
  });
  eolSel?.addEventListener('change', () => {
    pushHistory();
    opts.eolMode = /** @type {LtOpts['eolMode']} */ (eolSel.value || 'preserve');
    run();
  });

  root.querySelector('[data-lt-copy]')?.addEventListener('click', async () => {
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

  root.querySelector('[data-lt-clear]')?.addEventListener('click', () => {
    pushHistory();
    if (input) input.value = '';
    cleanedOutput = '';
    if (output) output.value = '';
    if (stats) stats.textContent = '';
    showToast(msg(root, 'cleared', 'Cleared'));
    input?.focus();
  });

  root.querySelector('[data-lt-reset]')?.addEventListener('click', () => {
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
  mountLineTools();
});
