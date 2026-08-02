/**
 * Text Character Cleaner Suite — pure transforms + browser mount.
 * Deterministic pipeline. Text stays in the browser.
 */

import { stripInvisible, stripLeadingBom, stripBidiControls } from './shared/invisible.js';

/** @typedef {{
 *   unicodeForm: 'none'|'NFC'|'NFD'|'NFKC'|'NFKD',
 *   removeInvisible: 'none'|'safe'|'aggressive',
 *   removeBidi: boolean,
 *   removeControl: boolean,
 *   keepTabsNewlines: boolean,
 *   smartQuotes: 'none'|'toStraight'|'toCurly',
 *   straightenDashes: boolean,
 *   removeAccents: boolean,
 *   removeEmoji: boolean,
 *   removeSymbols: boolean,
 *   removePunctuation: boolean,
 *   removeSpecial: boolean,
 *   removeNumbers: boolean,
 *   removeLetters: boolean,
 *   keepAlnumOnly: boolean,
 *   keepSpaces: boolean,
 *   keepChars: string,
 *   removeChars: string,
 *   asciiOnly: boolean,
 *   tidySpaces: boolean,
 * }} CcOpts */

/** @type {CcOpts} */
export const DEFAULTS = {
  unicodeForm: 'none',
  removeInvisible: 'none',
  removeBidi: false,
  removeControl: false,
  keepTabsNewlines: true,
  smartQuotes: 'none',
  straightenDashes: false,
  removeAccents: false,
  removeEmoji: false,
  removeSymbols: false,
  removePunctuation: false,
  removeSpecial: false,
  removeNumbers: false,
  removeLetters: false,
  keepAlnumOnly: false,
  keepSpaces: true,
  keepChars: '',
  removeChars: '',
  asciiOnly: false,
  tidySpaces: false,
};

/** @type {Record<string, Partial<CcOpts>>} */
export const PRESETS = {
  plain: {
    unicodeForm: 'NFC',
    removeInvisible: 'safe',
    smartQuotes: 'toStraight',
    straightenDashes: true,
    removeControl: true,
    keepTabsNewlines: true,
    tidySpaces: true,
  },
  filenameSafe: {
    unicodeForm: 'NFC',
    removeAccents: true,
    removeEmoji: true,
    keepAlnumOnly: true,
    keepSpaces: true,
    keepChars: '-_.',
    asciiOnly: true,
    removeInvisible: 'safe',
    tidySpaces: true,
  },
  nameList: {
    removeInvisible: 'safe',
    removeEmoji: true,
    removeSymbols: true,
    removeNumbers: true,
    tidySpaces: true,
  },
  numbersOnly: {
    removeLetters: true,
    removeEmoji: true,
    removeSymbols: true,
    removePunctuation: true,
    tidySpaces: true,
  },
  lettersOnly: {
    removeNumbers: true,
    removeEmoji: true,
    removeSymbols: true,
    tidySpaces: true,
  },
  asciiSafe: {
    unicodeForm: 'NFKC',
    removeInvisible: 'safe',
    removeAccents: true,
    removeEmoji: true,
    smartQuotes: 'toStraight',
    straightenDashes: true,
    asciiOnly: true,
    tidySpaces: true,
  },
};

// Accent stripping is limited to scripts where marks are decoration. In
// Devanagari, Arabic, Hebrew, Thai and Cyrillic the marks carry meaning, so a
// blind NFD strip would corrupt the text.
const ACCENTABLE_BASE = /[\u0041-\u024F\u0370-\u03FF\u1E00-\u1EFF\u1F00-\u1FFF]/;
const COMBINING_MARK = /\p{M}/u;

const RE_LETTER = /\p{L}/u;
const RE_NUMBER = /\p{N}/u;
const RE_PUNCT = /\p{P}/u;
const RE_SYMBOL = /\p{S}/u;

const EMOJI_CLUSTER = /[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}\p{Regional_Indicator}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;

const CURLY_TO_STRAIGHT = [
  [/[\u201C\u201D\u201E\u201F\u2033\u2036\u301D\u301E]/g, '"'],
  [/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"],
];

const DASHES_TO_ASCII = [
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
];

/** @param {string} text */
export function removeAccentsScriptAware(text) {
  const decomposed = text.normalize('NFD');
  let out = '';
  let base = '';
  for (const ch of decomposed) {
    if (COMBINING_MARK.test(ch)) {
      if (base && ACCENTABLE_BASE.test(base)) continue;
      out += ch;
      continue;
    }
    base = ch;
    out += ch;
  }
  return out.normalize('NFC');
}

/** @param {string} text */
export function removeEmojiClusters(text) {
  return text.replace(EMOJI_CLUSTER, '');
}

/** @param {string} text */
function quotesToCurly(text) {
  return text
    .replace(/(^|[\s([{<\u2014\u2013-])"/g, '$1\u201C')
    .replace(/"/g, '\u201D')
    .replace(/(^|[\s([{<\u2014\u2013-])'/g, '$1\u2018')
    .replace(/'/g, '\u2019');
}

/** @param {string} text */
function quotesToStraight(text) {
  let out = text;
  for (const [re, to] of CURLY_TO_STRAIGHT) out = out.replace(re, to);
  return out;
}

/**
 * Deterministic character clean pipeline.
 * @param {string} input
 * @param {Partial<CcOpts>} partial
 */
export function cleanCharacters(input, partial = {}) {
  const opts = { ...DEFAULTS, ...partial };
  const before = input.length;
  let text = input;

  const counts = {
    invisible: 0,
    control: 0,
    accents: 0,
    emoji: 0,
    letters: 0,
    numbers: 0,
    punctuation: 0,
    symbols: 0,
    other: 0,
  };

  // 1. Unicode normalization
  if (opts.unicodeForm !== 'none') {
    text = text.normalize(opts.unicodeForm);
  }

  // 2. Invisible characters
  if (opts.removeInvisible !== 'none') {
    const len = text.length;
    text = stripInvisible(stripLeadingBom(text), opts.removeInvisible);
    counts.invisible += len - text.length;
  }
  if (opts.removeBidi) {
    const len = text.length;
    text = stripBidiControls(text);
    counts.invisible += len - text.length;
  }

  // 3. Control characters
  if (opts.removeControl) {
    const len = text.length;
    text = opts.keepTabsNewlines
      ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      : text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    counts.control += len - text.length;
  }

  // 4. Smart quotes and typographic punctuation
  if (opts.smartQuotes === 'toStraight') text = quotesToStraight(text);
  else if (opts.smartQuotes === 'toCurly') text = quotesToCurly(text);
  if (opts.straightenDashes) {
    for (const [re, to] of DASHES_TO_ASCII) text = text.replace(re, to);
  }

  // 5. Accents
  if (opts.removeAccents) {
    const len = text.length;
    text = removeAccentsScriptAware(text);
    counts.accents += Math.max(0, len - text.length);
  }

  // 6. Emoji clusters. Symbol-class removals would otherwise shred a joined
  // emoji and leave orphaned joiners behind, so clear whole clusters first.
  const dropPunct = opts.removePunctuation || opts.removeSpecial;
  const dropSymbol = opts.removeSymbols || opts.removeSpecial;
  if (opts.removeEmoji || dropSymbol || opts.keepAlnumOnly) {
    const len = text.length;
    text = removeEmojiClusters(text);
    counts.emoji += len - text.length;
  }

  // 7. Character-class pass
  const keepSet = new Set([...opts.keepChars]);
  const removeSet = new Set([...opts.removeChars]);
  const needsClassPass =
    opts.removeLetters ||
    opts.removeNumbers ||
    dropPunct ||
    dropSymbol ||
    opts.keepAlnumOnly ||
    removeSet.size > 0;

  if (needsClassPass) {
    let out = '';
    for (const ch of text) {
      if (keepSet.has(ch)) {
        out += ch;
        continue;
      }
      if (removeSet.has(ch)) {
        counts.other += ch.length;
        continue;
      }
      const isLetter = RE_LETTER.test(ch);
      const isNumber = RE_NUMBER.test(ch);
      if (opts.removeLetters && isLetter) {
        counts.letters += ch.length;
        continue;
      }
      if (opts.removeNumbers && isNumber) {
        counts.numbers += ch.length;
        continue;
      }
      if (dropPunct && RE_PUNCT.test(ch)) {
        counts.punctuation += ch.length;
        continue;
      }
      if (dropSymbol && RE_SYMBOL.test(ch)) {
        counts.symbols += ch.length;
        continue;
      }
      if (opts.keepAlnumOnly && !isLetter && !isNumber) {
        const isSpace = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
        if (!(opts.keepSpaces && isSpace)) {
          counts.other += ch.length;
          continue;
        }
      }
      out += ch;
    }
    text = out;
  }

  // 8. ASCII fold — runs after accents so "café" survives as "cafe"
  if (opts.asciiOnly) {
    const len = text.length;
    text = text.replace(/[^\x00-\x7F]/g, '');
    counts.other += len - text.length;
  }

  // 9. Tidy gaps left behind by removals
  if (opts.tidySpaces) {
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, ''))
      .join('\n');
  }

  const after = text.length;

  return {
    output: text,
    stats: {
      before,
      after,
      removed: Math.max(0, before - after),
      counts,
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

export function mountCharacterCleaner(root = document.getElementById('character-cleaner')) {
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-cc-input]');
  const output = root.querySelector('[data-cc-output]');
  const stats = root.querySelector('[data-cc-stats]');
  const toast = root.querySelector('[data-cc-toast]');
  const undoBtn = root.querySelector('[data-cc-undo]');
  const tip = root.querySelector('[data-cc-preset-tip]');
  const keepInput = root.querySelector('[data-cc-keep-chars]');
  const removeInput = root.querySelector('[data-cc-remove-chars]');
  const optionEls = [...root.querySelectorAll('[data-cc-opt]')];
  const modeEls = [...root.querySelectorAll('[data-cc-mode]')];
  const presetEls = [...root.querySelectorAll('[data-cc-preset]')];

  /** @type {CcOpts} */
  const opts = { ...DEFAULTS };
  /** @type {{ input: string, opts: CcOpts }[]} */
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
      const key = el.dataset.ccOpt;
      if (!(key in opts)) return;
      const on = !!opts[key];
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    modeEls.forEach((el) => {
      const group = el.dataset.ccModeGroup;
      const val = el.dataset.ccMode;
      let active = false;
      if (group === 'unicode') active = opts.unicodeForm === val;
      if (group === 'invisible') active = opts.removeInvisible === val;
      if (group === 'quotes') active = opts.smartQuotes === val;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (keepInput) keepInput.value = opts.keepChars;
    if (removeInput) removeInput.value = opts.removeChars;
  };

  const run = () => {
    const raw = input?.value ?? '';
    if (!raw) {
      cleanedOutput = '';
      if (output) output.value = '';
      if (stats) stats.textContent = '';
      return;
    }
    const result = cleanCharacters(raw, opts);
    cleanedOutput = result.output;
    if (output) output.value = result.output;
    if (stats) {
      const s = result.stats;
      const tpl = msg(root, 'statsTpl', '{before} → {after} chars · {removed} removed');
      stats.textContent = tpl
        .replace('{before}', String(s.before))
        .replace('{after}', String(s.after))
        .replace('{removed}', String(s.removed));
    }
  };

  const applyPreset = (name) => {
    const p = PRESETS[name];
    if (!p) return;
    pushHistory();
    Object.assign(opts, DEFAULTS, p);
    syncOptions();
    presetEls.forEach((el) => el.classList.toggle('is-active', el.dataset.ccPreset === name));
    if (tip) {
      const map = {
        plain: root.dataset.tipPlain,
        filenameSafe: root.dataset.tipFilename,
        nameList: root.dataset.tipNames,
        numbersOnly: root.dataset.tipNumbers,
        lettersOnly: root.dataset.tipLetters,
        asciiSafe: root.dataset.tipAscii,
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
      const key = el.dataset.ccOpt;
      if (!(key in opts) || typeof opts[key] !== 'boolean') return;
      pushHistory();
      opts[key] = !opts[key];

      if (key === 'removeSpecial' && opts.removeSpecial) {
        opts.removePunctuation = false;
        opts.removeSymbols = false;
      }
      if ((key === 'removePunctuation' || key === 'removeSymbols') && opts[key]) {
        opts.removeSpecial = false;
      }
      if (key === 'keepAlnumOnly' && opts.keepAlnumOnly) {
        opts.removeSpecial = false;
        opts.removePunctuation = false;
        opts.removeSymbols = false;
      }
      if (key === 'removeLetters' && opts.removeLetters && opts.removeNumbers) {
        showToast(msg(root, 'bothClassesWarn', 'Removing letters and numbers leaves punctuation only'), 'warn');
      }

      syncOptions();
      run();
    });
  });

  modeEls.forEach((el) => {
    el.addEventListener('click', () => {
      const group = el.dataset.ccModeGroup;
      const val = el.dataset.ccMode;
      pushHistory();
      if (group === 'unicode') {
        opts.unicodeForm = /** @type {CcOpts['unicodeForm']} */ (
          opts.unicodeForm === val ? 'none' : val
        );
      }
      if (group === 'invisible') {
        opts.removeInvisible = /** @type {CcOpts['removeInvisible']} */ (
          opts.removeInvisible === val ? 'none' : val
        );
        if (opts.removeInvisible === 'aggressive') {
          showToast(msg(root, 'aggressiveWarn', 'Aggressive mode may affect Arabic/Indic joiners'), 'warn');
        }
      }
      if (group === 'quotes') {
        opts.smartQuotes = /** @type {CcOpts['smartQuotes']} */ (
          opts.smartQuotes === val ? 'none' : val
        );
      }
      syncOptions();
      run();
    });
  });

  presetEls.forEach((el) => {
    el.addEventListener('click', () => applyPreset(el.dataset.ccPreset || ''));
  });

  keepInput?.addEventListener('input', () => {
    opts.keepChars = keepInput.value;
    run();
  });
  removeInput?.addEventListener('input', () => {
    opts.removeChars = removeInput.value;
    run();
  });

  root.querySelector('[data-cc-copy]')?.addEventListener('click', async () => {
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

  root.querySelector('[data-cc-clear]')?.addEventListener('click', () => {
    pushHistory();
    if (input) input.value = '';
    cleanedOutput = '';
    if (output) output.value = '';
    if (stats) stats.textContent = '';
    showToast(msg(root, 'cleared', 'Cleared'));
    input?.focus();
  });

  root.querySelector('[data-cc-reset]')?.addEventListener('click', () => {
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
  mountCharacterCleaner();
});
