import { LayoutMode } from './modes/LayoutMode.js';
import { PhoneticMode } from './modes/PhoneticMode.js';
import { HangulComposeMode } from './modes/HangulComposeMode.js';
import { CandidateImeMode } from './modes/CandidateImeMode.js';
import { HistoryStack } from './utils/history.js';
import { copyText, downloadText } from './utils/clipboard.js';
import { speak } from './utils/tts.js';
import { romanize } from './utils/romanize.js';
import { loadDraft, saveDraft, clearDraft, syncDraft, formatDraftAge } from './utils/draftStore.js';
import { Predictor } from './utils/predict.js';
import { applySiteTheme, getTheme } from '../theme.js';
import {
  EMOJI_TABS, EMOJI_DATA, applySkinTone, searchEmoji, SKIN_TONE_COLORS,
} from './emoji/appleEmoji.js';

const ROW_CODES = [
  ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'],
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
  ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'],
];

const RECENT_KEY = 'ww-emoji-recent';

async function resolveKeyboardConfig(root) {
  const dataEl = document.getElementById('keyboard-data');
  if (dataEl?.textContent?.trim()) {
    return JSON.parse(dataEl.textContent);
  }
  if (root.dataset.keyboard) {
    return JSON.parse(root.dataset.keyboard);
  }
  const slug = (root.dataset.keyboardSlug || '').trim();
  if (!slug) return {};

  const url = `/data/keyboards/${encodeURIComponent(slug)}.json`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Failed to load keyboard config ${url} (${res.status})`);
  }
  const config = await res.json();
  const practice = root.dataset.keyboardPractice;
  if (practice === '1' || practice === 'true') {
    config.practice = true;
  }
  return config;
}

export class KeyboardApp {
  constructor(root, config = null) {
    this.root = root;
    if (config) {
      this.config = config;
    } else {
      const dataEl = document.getElementById('keyboard-data');
      this.config = dataEl
        ? JSON.parse(dataEl.textContent)
        : JSON.parse(root.dataset.keyboard || '{}');
    }
    this.layouts = this.config.layouts || [];
    this.activeCode = this.config.default_layout || this.layouts[0]?.code;
    this.english = false;
    this.shift = false;
    this.caps = false;
    this.emojiMode = false;
    this.mobilePane = 'abc'; // abc | 123 | emoji
    this.emojiTab = 'smileys';
    this.emojiQuery = '';
    this.skinTone = Number(localStorage.getItem('ww-emoji-tone') || 0);
    this.history = new HistoryStack();
    this.practice = this.config.practice || false;
    this.phrases = this.config.phrases || [];
    this.practiceIndex = 0;
    this.mode = null;
    this.candidates = [];
    this.composition = '';
    this._draftTimer = null;
    this._pendingDraft = null;
    this._pressTimers = new Map();
    this._suggestion = null;
    this._learnTimer = null;
    this._ctrlSolo = false;
    this._ctrlAt = 0;
    this._vvCleanup = null;
    this.predictor = new Predictor({
      slug: this.config.slug,
      script: this.config.script,
      languageCode: this.config.language_code,
      phrases: this.phrases,
    });

    this.buildDom();
    this.setupMobileEditor();
    this.bind();
    this.setLayout(this.activeCode);
    this.rememberRecent();
    this.updateRomanization();
    if (this.practice) this.renderPractice();
    else this.offerDraftRestore();
  }

  /** True when the sticky on-screen board should own typing (phones/tablets). */
  isTouchTypingSurface() {
    try {
      return window.matchMedia('(hover: none), (pointer: coarse)').matches
        || (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 1024px)').matches);
    } catch {
      return 'ontouchstart' in window;
    }
  }

  /**
   * Keep the OS soft keyboard closed so it cannot cover the sticky board or
   * the editor caret. Focus while readonly, then drop readonly so caret /
   * selection still work.
   */
  armReadonlyGuard() {
    if (!this.editor || !this._touchTyping) return;
    this.editor.setAttribute('readonly', 'readonly');
  }

  disarmReadonlyGuard() {
    if (!this.editor || !this._touchTyping) return;
    requestAnimationFrame(() => {
      this.editor.removeAttribute('readonly');
    });
  }

  focusEditor({ preventScroll = true } = {}) {
    if (!this.editor) return;
    this.armReadonlyGuard();
    try {
      this.editor.focus({ preventScroll });
    } catch {
      this.editor.focus();
    }
    this.disarmReadonlyGuard();
    this.ensureEditorVisible();
  }

  ensureEditorVisible() {
    if (!this.editor) return;
    const board = this.root.querySelector('[data-board-wrap]');
    const boardH = board && !this.tool?.classList.contains('kb-tool--os-keyboard')
      ? board.getBoundingClientRect().height
      : 0;
    const margin = Math.ceil(boardH + 12);
    this.editor.style.scrollMarginBottom = `${margin}px`;
    if (this.editor.parentElement) {
      this.editor.parentElement.style.scrollMarginBottom = `${margin}px`;
    }

    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop + 8 : 8;
    const viewBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - boardH - 8;
    const rect = this.editor.getBoundingClientRect();
    if (rect.bottom > viewBottom || rect.top < viewTop) {
      this.editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // Keep the caret line inside the textarea viewport when typing near the end.
    try {
      const ratio = this.editor.value.length
        ? this.editor.selectionStart / this.editor.value.length
        : 1;
      const target = Math.max(0, (this.editor.scrollHeight * ratio) - this.editor.clientHeight * 0.65);
      if (Math.abs(this.editor.scrollTop - target) > 24) {
        this.editor.scrollTop = target;
      }
      if (this.ghostEl && !this.ghostEl.hidden) {
        this.ghostEl.scrollTop = this.editor.scrollTop;
      }
    } catch { /* ignore */ }
  }

  setupMobileEditor() {
    this._touchTyping = this.isTouchTypingSurface();
    if (!this.editor) return;

    this.editor.setAttribute('inputmode', 'none');
    this.editor.setAttribute('enterkeyhint', 'done');
    this.editor.setAttribute('autocomplete', 'off');
    this.editor.setAttribute('autocapitalize', 'off');
    this.editor.setAttribute('autocorrect', 'off');

    if (!this._touchTyping) return;
    this.tool?.classList.add('kb-tool--touch');

    // Arm readonly before the browser focuses the field on touch.
    this.editor.addEventListener('touchstart', () => this.armReadonlyGuard(), { passive: true });
    this.editor.addEventListener('focus', () => {
      this.disarmReadonlyGuard();
      this.ensureEditorVisible();
    });

    // Tapping virtual keys blurs the editor; re-focus without opening OS keyboard.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target.closest([
        '[data-code]',
        '[data-insert]',
        '[data-emoji]',
        '[data-cand]',
        '[data-pane]',
        '[data-action]',
        '[data-layout]',
        '[data-draft-action]',
        '[data-accept-suggestion]',
        '.kb-key',
      ].join(','))) {
        this.armReadonlyGuard();
      }
    }, { passive: true });

    const vv = window.visualViewport;
    if (!vv) return;

    const syncViewport = () => {
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      this.root.style.setProperty('--ww-os-keyboard', `${Math.round(occluded)}px`);
      const open = occluded > 120;
      this.tool?.classList.toggle('kb-tool--os-keyboard', open);
      if (document.activeElement === this.editor) {
        this.ensureEditorVisible();
      }
    };
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    syncViewport();
    this._vvCleanup = () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  }

  buildDom() {
    this.root.innerHTML = `
      <div class="kb-tool" data-theme-scope>
        <div class="kb-toolbar" role="toolbar" aria-label="Editor tools">
          <div class="kb-toolbar__layouts" data-layouts></div>
          <button type="button" class="kb-en-toggle" data-action="toggle-en" title="Press Esc">${this.english ? 'Switch to target' : 'Switch to English (Esc)'}</button>
        </div>
        <div class="kb-draft" data-draft-banner hidden role="status"></div>
        <div class="kb-editor-wrap">
          <label class="kb-sr" for="kb-editor-${this.config.slug}">Text editor</label>
          <textarea id="kb-editor-${this.config.slug}" class="kb-editor" data-editor
            dir="${this.config.direction || 'ltr'}"
            lang="${this.config.language_code || 'en'}"
            placeholder="Type here…"
            spellcheck="false"
            inputmode="none"
            enterkeyhint="done"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            style="${this.config.font_family ? `font-family:${this.config.font_family}` : ''}"></textarea>
          <div class="kb-ghost" data-ghost hidden aria-hidden="true"
            dir="${this.config.direction || 'ltr'}"
            style="${this.config.font_family ? `font-family:${this.config.font_family}` : ''}"></div>
          <div class="kb-editor-actions" role="group" aria-label="Text actions">
            <button type="button" class="kb-fab" data-action="undo" title="Undo" aria-label="Undo"><span aria-hidden="true">↺</span></button>
            <button type="button" class="kb-fab" data-action="copy" title="Copy" aria-label="Copy text"><span aria-hidden="true">⧉</span></button>
            <button type="button" class="kb-fab" data-action="clear" title="Delete" aria-label="Delete text"><span aria-hidden="true">×</span></button>
          </div>
        </div>
        <div class="kb-candidates" data-candidates hidden role="listbox" aria-label="Candidates"></div>
        <div class="kb-composition" data-composition hidden aria-live="polite"></div>
        <p class="kb-romanization" data-romanization aria-live="polite"></p>
        <div class="kb-practice" data-practice hidden></div>
        <div class="kb-quick" role="toolbar" aria-label="Quick actions">
          <button type="button" data-action="speak" title="Speak">Speak</button>
          <button type="button" data-action="download" title="Download">Save</button>
          <button type="button" data-action="theme" title="Theme">Theme</button>
          <button type="button" data-action="dual" title="Dual script">Dual</button>
          <button type="button" data-action="search" title="Google search">Search</button>
          <button type="button" data-action="translate" title="Translate">Translate</button>
          <button type="button" data-action="email" title="Email">Email</button>
          <button type="button" data-action="wiki" title="Wikipedia">Wiki</button>
        </div>
        <p class="kb-hint">Suggestions appear in grey as you type — press <kbd>Tab</kbd>, <kbd>→</kbd>, or tap <kbd>Ctrl</kbd> to accept. Press <kbd>Esc</kbd> to switch English ↔ target. Drafts stay in this browser only and expire after 24 hours. Search, Translate, Email, and Wiki open in a new tab — your text stays private.</p>
        <div class="kb-board-wrap" data-board-wrap>
          <div class="kb-mobile-panes" data-mobile-panes role="tablist" aria-label="Keyboard panes">
            <button type="button" class="kb-chip is-active" data-pane="abc">ABC</button>
            <button type="button" class="kb-chip" data-pane="123">123</button>
            <button type="button" class="kb-chip" data-pane="emoji">😊</button>
          </div>
          <div class="kb-board" data-board role="group" aria-label="Virtual keyboard"></div>
        </div>
        <p class="kb-toast" data-toast hidden role="status"></p>
      </div>
    `;

    this.editor = this.root.querySelector('[data-editor]');
    this.ghostEl = this.root.querySelector('[data-ghost]');
    this.board = this.root.querySelector('[data-board]');
    this.layoutBar = this.root.querySelector('[data-layouts]');
    this.candidateEl = this.root.querySelector('[data-candidates]');
    this.compositionEl = this.root.querySelector('[data-composition]');
    this.romanEl = this.root.querySelector('[data-romanization]');
    this.practiceEl = this.root.querySelector('[data-practice]');
    this.toastEl = this.root.querySelector('[data-toast]');
    this.draftBanner = this.root.querySelector('[data-draft-banner]');
    this.tool = this.root.querySelector('.kb-tool');
    this.enToggle = this.root.querySelector('.kb-en-toggle');

    const savedTheme = getTheme();
    if (savedTheme === 'dark') this.tool.classList.add('is-dark');
    applySiteTheme(savedTheme);

    this.renderLayoutSwitcher();
    this.renderBoard();
  }

  renderLayoutSwitcher() {
    this.layoutBar.innerHTML = this.layouts.map((l) => `
      <label class="kb-layout-opt">
        <input type="radio" name="kb-layout-${this.config.slug}" data-layout="${l.code}"
          ${!this.emojiMode && l.code === this.activeCode ? 'checked' : ''} />
        <span>${l.label}</span>
      </label>
    `).join('') + `
      <label class="kb-layout-opt">
        <input type="radio" name="kb-layout-${this.config.slug}" data-action="emoji"
          ${this.emojiMode ? 'checked' : ''} />
        <span>😊 Emoji</span>
      </label>
    `;
    if (this.enToggle) {
      this.enToggle.textContent = this.english ? 'Switch to target' : 'Switch to English (Esc)';
    }
  }

  renderBoard() {
    this.root.querySelectorAll('[data-pane]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.pane === this.mobilePane);
    });
    if (this.emojiMode || this.mobilePane === 'emoji') {
      this.emojiMode = true;
      this.renderEmojiBoard();
      return;
    }
    if (this.mobilePane === '123') {
      this.renderNumericBoard();
      return;
    }
    const labels = this.mode?.getKeyLabels?.({ shift: this.shift, caps: this.caps }) || {};

    this.board.innerHTML = `
      <div class="kb-row">
        ${ROW_CODES[0].map((code) => keyBtn(code, labels)).join('')}
        <button type="button" class="kb-key kb-key--back" data-code="Backspace" aria-label="Backspace">
          <span class="kb-key__main">Backspace</span>
        </button>
      </div>
      <div class="kb-row">
        <button type="button" class="kb-key kb-key--wide" data-code="Tab"><span class="kb-key__main">Tab</span></button>
        ${ROW_CODES[1].map((code) => keyBtn(code, labels)).join('')}
      </div>
      <div class="kb-row">
        <button type="button" class="kb-key kb-key--wide ${this.caps ? 'is-active' : ''}" data-code="CapsLock"><span class="kb-key__main">Caps</span></button>
        ${ROW_CODES[2].map((code) => keyBtn(code, labels)).join('')}
        <button type="button" class="kb-key kb-key--enter" data-code="Enter"><span class="kb-key__main">Enter</span></button>
      </div>
      <div class="kb-row">
        <button type="button" class="kb-key kb-key--shift ${this.shift ? 'is-active' : ''}" data-code="ShiftLeft"><span class="kb-key__main">Shift</span></button>
        ${ROW_CODES[3].map((code) => keyBtn(code, labels)).join('')}
        <button type="button" class="kb-key kb-key--shift ${this.shift ? 'is-active' : ''}" data-code="ShiftRight"><span class="kb-key__main">Shift</span></button>
      </div>
      <div class="kb-row">
        <button type="button" class="kb-key kb-key--mod" data-code="ControlLeft"><span class="kb-key__main">Ctrl</span></button>
        <button type="button" class="kb-key kb-key--emoji" data-action="emoji" title="Emoji"><span class="kb-key__main">😊💕</span></button>
        <button type="button" class="kb-key kb-key--mod" data-code="AltLeft"><span class="kb-key__main">Alt</span></button>
        <button type="button" class="kb-key kb-key--space" data-code="Space" aria-label="Space"></button>
        <button type="button" class="kb-key kb-key--mod" data-code="AltRight"><span class="kb-key__main">AltGr</span></button>
        <button type="button" class="kb-key kb-key--mod" data-code="ControlRight"><span class="kb-key__main">Ctrl</span></button>
      </div>
    `;
  }

  renderNumericBoard() {
    const rows = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
      ['.', ',', '?', '!', "'", '"', '#', '%', '*', '+'],
    ];
    this.board.innerHTML = `
      ${rows.map((row) => `
        <div class="kb-row">
          ${row.map((ch) => `<button type="button" class="kb-key kb-key--touch" data-insert="${escapeAttr(ch)}"><span class="kb-key__main">${escapeHtml(ch)}</span></button>`).join('')}
        </div>
      `).join('')}
      <div class="kb-row">
        <button type="button" class="kb-key kb-key--wide" data-pane="abc">ABC</button>
        <button type="button" class="kb-key kb-key--wide" data-code="Backspace">⌫</button>
        <button type="button" class="kb-key kb-key--space" data-code="Space" aria-label="Space"></button>
        <button type="button" class="kb-key kb-key--emoji" data-pane="emoji">😊</button>
      </div>
    `;
  }

  renderEmojiBoard() {
    const list = this.emojiList();
    this.board.innerHTML = `
      <div class="kb-emoji">
        <div class="kb-emoji__tabs" role="tablist" aria-label="Emoji categories">
          ${EMOJI_TABS.map((t) => `
            <button type="button" class="kb-emoji__tab ${this.emojiTab === t.id ? 'is-active' : ''}"
              data-emoji-tab="${t.id}" title="${escapeAttr(t.label)}" aria-label="${escapeAttr(t.label)}">${t.icon}</button>
          `).join('')}
        </div>
        <input class="kb-emoji__search" type="search" placeholder="Search emoji…" value="${escapeAttr(this.emojiQuery)}" data-emoji-search>
        <div class="kb-emoji__grid" role="listbox" aria-label="Emojis">
          ${list.map((e) => {
            const shown = applySkinTone(e, this.skinTone);
            return `<button type="button" class="kb-emoji__btn" data-emoji="${escapeAttr(shown)}" aria-label="${escapeAttr(shown)}">${shown}</button>`;
          }).join('')}
        </div>
        <div class="kb-emoji__tone" aria-label="Skin tone">
          ${SKIN_TONE_COLORS.map((c, i) => `
            <button type="button" class="${this.skinTone === i ? 'is-active' : ''}" data-skin="${i}"
              style="background:${c}" aria-label="Skin tone ${i}"></button>
          `).join('')}
        </div>
        <div class="kb-row" style="margin-top:0.45rem">
          <button type="button" class="kb-key kb-key--wide" data-action="emoji">ABC</button>
          <button type="button" class="kb-key kb-key--wide" data-code="Backspace">⌫</button>
          <button type="button" class="kb-key kb-key--space" data-code="Space" aria-label="Space"></button>
        </div>
      </div>
    `;
    const search = this.board.querySelector('[data-emoji-search]');
    search?.addEventListener('input', (e) => {
      this.emojiQuery = e.target.value;
      this.renderEmojiBoard();
      this.board.querySelector('[data-emoji-search]')?.focus();
    });
  }

  emojiList() {
    if (this.emojiQuery.trim()) return searchEmoji(this.emojiQuery);
    if (this.emojiTab === 'recent') return this.loadRecentEmoji();
    return EMOJI_DATA[this.emojiTab] || EMOJI_DATA.smileys;
  }

  loadRecentEmoji() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 48);
    } catch {
      return [];
    }
  }

  rememberEmoji(emoji) {
    try {
      const list = this.loadRecentEmoji().filter((e) => e !== emoji);
      list.unshift(emoji);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 64)));
    } catch { /* ignore */ }
  }

  flashKey(code) {
    if (!code) return;
    const key = Array.from(this.board.querySelectorAll('[data-code]'))
      .find((candidate) => candidate.dataset.code === code);
    if (!key) return;

    clearTimeout(this._pressTimers.get(code));
    key.classList.add('is-pressed');
    this._pressTimers.set(code, setTimeout(() => {
      key.classList.remove('is-pressed');
      this._pressTimers.delete(code);
    }, 120));
  }

  // Predictions only make sense at the very end of the text, and must stay out
  // of the way of an IME that is already offering candidates.
  canSuggest() {
    if (!this.predictor?.enabled || this.emojiMode || this.practice) return false;
    if (this.candidates.length || this.composition) return false;
    const { selectionStart, selectionEnd, value } = this.editor;
    return selectionStart === selectionEnd && selectionStart === value.length;
  }

  updateSuggestion() {
    if (!this.canSuggest()) {
      this.clearSuggestion();
      return;
    }
    const before = this.editor.value;
    const next = this.predictor.suggest(before);
    if (!next || !next.text) {
      this.clearSuggestion();
      return;
    }
    this._suggestion = next;
    this.renderGhost(before, next.text);
  }

  renderGhost(typed, hint) {
    this.ghostEl.hidden = false;
    this.ghostEl.innerHTML =
      `<span class="kb-ghost__typed">${escapeHtml(typed)}</span>`
      + `<span class="kb-ghost__hint" data-accept-suggestion>${escapeHtml(hint)}</span>`;
    this.ghostEl.scrollTop = this.editor.scrollTop;
  }

  clearSuggestion() {
    if (!this._suggestion && this.ghostEl.hidden) return;
    this._suggestion = null;
    this.ghostEl.hidden = true;
    this.ghostEl.innerHTML = '';
  }

  acceptSuggestion() {
    if (!this._suggestion || !this.canSuggest()) return false;
    const { text } = this._suggestion;
    this.pushHistory();
    this.clearSuggestion();
    this.ctx().insert(text);
    this.focusEditor();
    this.updateRomanization();
    this.queueDraftSave();
    this.queueLearn();
    this.updateSuggestion();
    return true;
  }

  queueLearn() {
    clearTimeout(this._learnTimer);
    this._learnTimer = setTimeout(() => {
      this.predictor.learn(this.editor.value);
      this.predictor.persist();
    }, 900);
  }

  bind() {
    this.root.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('[data-code]');
      if (key) this.flashKey(key.dataset.code);
    });

    this.root.addEventListener('click', (e) => {
      // Tapping the ghost word is the touch equivalent of pressing Tab.
      if (e.target.closest('[data-accept-suggestion]')) {
        this.acceptSuggestion();
        return;
      }
      const paneBtn = e.target.closest('[data-pane]');
      if (paneBtn) {
        this.mobilePane = paneBtn.dataset.pane;
        this.emojiMode = this.mobilePane === 'emoji';
        if (this.emojiMode) this.emojiTab = this.loadRecentEmoji().length ? 'recent' : 'smileys';
        this.renderLayoutSwitcher();
        this.renderBoard();
        return;
      }
      const insertBtn = e.target.closest('[data-insert]');
      if (insertBtn) {
        this.pushHistory();
        this.ctx().insert(insertBtn.dataset.insert);
        this.focusEditor();
        this.updateRomanization();
        this.queueDraftSave();
        return;
      }
      const layoutBtn = e.target.closest('[data-layout]');
      if (layoutBtn) {
        this.emojiMode = false;
        this.mobilePane = 'abc';
        this.setLayout(layoutBtn.dataset.layout);
        return;
      }
      const emojiRadio = e.target.closest('input[data-action="emoji"]');
      if (emojiRadio) {
        this.runAction('emoji');
        return;
      }
      const emojiTab = e.target.closest('[data-emoji-tab]');
      if (emojiTab) {
        this.emojiTab = emojiTab.dataset.emojiTab;
        this.emojiQuery = '';
        this.renderEmojiBoard();
        return;
      }
      const skin = e.target.closest('[data-skin]');
      if (skin) {
        this.skinTone = Number(skin.dataset.skin);
        localStorage.setItem('ww-emoji-tone', String(this.skinTone));
        this.renderEmojiBoard();
        return;
      }
      const emojiBtn = e.target.closest('[data-emoji]');
      if (emojiBtn) {
        this.pushHistory();
        const emoji = emojiBtn.dataset.emoji;
        this.ctx().insert(emoji);
        this.rememberEmoji(emoji);
        this.focusEditor();
        this.queueDraftSave();
        return;
      }
      const draftAct = e.target.closest('[data-draft-action]')?.dataset.draftAction;
      if (draftAct) {
        this.handleDraftAction(draftAct);
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) {
        this.runAction(action);
        return;
      }
      const key = e.target.closest('[data-code]');
      if (key) {
        this.pushHistory();
        this.handleCode(key.dataset.code);
        // Pointer events provide immediate feedback. Keep click as a fallback
        // for older browsers without Pointer Events.
        if (!window.PointerEvent) this.flashKey(key.dataset.code);
        this.focusEditor();
      }
      const cand = e.target.closest('[data-cand]');
      if (cand) {
        this.pushHistory();
        if (this.mode?.commitCandidate) {
          this.mode.commitCandidate(this.ctx(), cand.dataset.cand);
        } else {
          this.ctx().insert(cand.dataset.cand);
          this.mode?.reset?.();
          this.setComposition('');
        }
        this.setCandidates([]);
      }
    });

    this.editor.addEventListener('keydown', (e) => {
      // A solo Ctrl tap accepts the suggestion; Ctrl+<key> stays a shortcut.
      if (e.key === 'Control') {
        this._ctrlSolo = true;
        this._ctrlAt = Date.now();
      } else {
        this._ctrlSolo = false;
      }

      if (this._suggestion && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'Tab' || (e.key === 'ArrowRight' && this.canSuggest())) {
          e.preventDefault();
          this.acceptSuggestion();
          return;
        }
      }

      if (e.key === 'Escape' && this._suggestion) {
        e.preventDefault();
        this.clearSuggestion();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.emojiMode) {
          this.emojiMode = false;
          this.mobilePane = 'abc';
          this.renderLayoutSwitcher();
          this.renderBoard();
          return;
        }
        this.english = !this.english;
        this.renderLayoutSwitcher();
        this.renderBoard();
        this.toast(this.english ? 'English mode' : 'Target language mode');
        return;
      }

      // Native shortcuts: Select All, Copy, Paste, Cut, etc.
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.runAction(e.shiftKey ? 'redo' : 'undo');
        }
        return;
      }

      // Keep caret/selection movement native (mouse + arrows)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        return;
      }

      const code = e.code;
      if (this.english || this.emojiMode) {
        this.flashKey(code);
        return;
      }
      if (e.key === 'Shift') {
        this.shift = true;
        this.renderBoard();
        this.flashKey(code);
        return;
      }
      if (e.key === 'CapsLock') {
        this.caps = !this.caps;
        this.renderBoard();
        this.flashKey('CapsLock');
        return;
      }

      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code)) {
        this.flashKey(code);
        return;
      }

      e.preventDefault();
      this.pushHistory();
      this.flashKey(code);
      this.handleCode(code);
    });

    this.editor.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.shift = false;
        if (!this.emojiMode) this.renderBoard();
      }
      if (e.key === 'Control' && this._ctrlSolo && Date.now() - this._ctrlAt < 600) {
        this._ctrlSolo = false;
        this.acceptSuggestion();
      }
    });

    this.editor.addEventListener('input', () => {
      this.updateRomanization();
      this.queueDraftSave();
      this.updateSuggestion();
      this.queueLearn();
    });

    this.editor.addEventListener('scroll', () => {
      if (!this.ghostEl.hidden) this.ghostEl.scrollTop = this.editor.scrollTop;
    });

    this.editor.addEventListener('blur', () => this.clearSuggestion());

    // Keep the caret in the editor when the ghost word itself is tapped,
    // otherwise blur would drop the suggestion before the click lands.
    this.ghostEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-accept-suggestion]')) e.preventDefault();
    });

    ['click', 'keyup'].forEach((evt) => {
      this.editor.addEventListener(evt, () => {
        if (!this.canSuggest()) this.clearSuggestion();
      });
    });

    window.addEventListener('beforeunload', () => {
      this.predictor.learn(this.editor.value);
      this.predictor.persist();
      if (this.practice || !this.config.slug) return;
      clearTimeout(this._draftTimer);
      // Only persist non-empty text; do not erase a stored draft on refresh
      saveDraft(this.config.slug, this.editor.value);
    });
  }

  offerDraftRestore() {
    if (this.practice || !this.config.slug) return;
    const draft = loadDraft(this.config.slug);
    if (!draft) return;
    this._pendingDraft = draft;
    this.draftBanner.hidden = false;
    this.draftBanner.innerHTML = `
      <span>Previous text found (${escapeHtml(formatDraftAge(draft.savedAt))}). Drafts stay in this browser only.</span>
      <span class="kb-draft__actions">
        <button type="button" class="kb-chip is-accent" data-draft-action="restore">Restore</button>
        <button type="button" class="kb-chip" data-draft-action="dismiss">Dismiss</button>
      </span>
    `;
  }

  handleDraftAction(action) {
    if (action === 'restore' && this._pendingDraft) {
      this.pushHistory();
      this.editor.value = this._pendingDraft.text;
      this.updateRomanization();
      this.toast('Draft restored');
      this.focusEditor();
    }
    if (action === 'dismiss' && this.config.slug) {
      clearDraft(this.config.slug);
    }
    this._pendingDraft = null;
    if (this.draftBanner) {
      this.draftBanner.hidden = true;
      this.draftBanner.innerHTML = '';
    }
  }

  queueDraftSave() {
    if (this.practice || !this.config.slug) return;
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => {
      // User edited this session — empty text means they cleared it intentionally
      syncDraft(this.config.slug, this.editor.value);
    }, 600);
  }

  setLayout(code) {
    this.activeCode = code;
    this.emojiMode = false;
    const layout = this.layouts.find((l) => l.code === code) || this.layouts[0];
    if (!layout) return;

    const cfg = layout.config_json || {};
    const modeName = cfg.mode || this.config.engine_mode || 'layout';

    if (modeName === 'phonetic' || layout.code === 'phonetic' || layout.code === 'telex') {
      this.mode = new PhoneticMode(layout.phonetic_json || {}, cfg);
    } else if (modeName === 'hangul' || this.config.engine_mode === 'hangul') {
      this.mode = new HangulComposeMode(layout.layout_json);
    } else if (modeName === 'ime' || layout.code === 'pinyin' || layout.code === 'romaji' || layout.code === 'katakana') {
      this.mode = new CandidateImeMode(layout.phonetic_json || {}, cfg);
    } else {
      this.mode = new LayoutMode(layout.layout_json, cfg);
    }

    this.romanizer = cfg.romanizer || 'none';
    this.lang = this.config.language_code || 'en';
    this.renderLayoutSwitcher();
    this.renderBoard();
    this.setCandidates([]);
    this.focusEditor();
  }

  handleCode(code) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.shift = !this.shift;
      this.renderBoard();
      return;
    }
    if (code === 'CapsLock') {
      this.caps = !this.caps;
      this.renderBoard();
      return;
    }
    if (code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight') {
      return;
    }

    // Select-all / any selection + Backspace or Delete — clear selection on every keyboard
    if ((code === 'Backspace' || code === 'Delete') && this.editor.selectionStart !== this.editor.selectionEnd) {
      this.mode?.reset?.();
      this.setComposition('');
      this.setCandidates([]);
      if (code === 'Delete') this.ctx().deleteForward();
      else this.ctx().backspace();
      this.updateRomanization();
      this.queueDraftSave();
      if (this.practice) this.checkPractice();
      return;
    }

    if (code === 'Delete') {
      this.ctx().deleteForward();
      this.updateRomanization();
      this.queueDraftSave();
      if (this.practice) this.checkPractice();
      return;
    }

    if (this.english) {
      const en = new LayoutMode(englishLayout());
      en.onKey(code, this.ctx());
    } else {
      this.mode?.onKey(code, this.ctx());
    }

    if (this.shift && code !== 'ShiftLeft' && code !== 'ShiftRight') {
      this.shift = false;
      this.renderBoard();
    }
    this.updateRomanization();
    this.queueDraftSave();
    this.updateSuggestion();
    this.queueLearn();
    if (this.practice) this.checkPractice();
  }

  ctx() {
    const self = this;
    return {
      get value() { return self.editor.value; },
      get selectionStart() { return self.editor.selectionStart; },
      get selectionEnd() { return self.editor.selectionEnd; },
      get shift() { return self.shift; },
      get caps() { return self.caps; },
      insert(text) {
        const start = self.editor.selectionStart;
        const end = self.editor.selectionEnd;
        const v = self.editor.value;
        self.editor.value = v.slice(0, start) + text + v.slice(end);
        const pos = start + text.length;
        self.editor.setSelectionRange(pos, pos);
        self.ensureEditorVisible();
      },
      backspace() {
        const start = self.editor.selectionStart;
        const end = self.editor.selectionEnd;
        const v = self.editor.value;
        if (start !== end) {
          self.editor.value = v.slice(0, start) + v.slice(end);
          self.editor.setSelectionRange(start, start);
          self.ensureEditorVisible();
          return;
        }
        if (start === 0) return;
        const before = [...v.slice(0, start)];
        before.pop();
        const next = before.join('') + v.slice(end);
        const pos = before.join('').length;
        self.editor.value = next;
        self.editor.setSelectionRange(pos, pos);
        self.ensureEditorVisible();
      },
      deleteForward() {
        const start = self.editor.selectionStart;
        const end = self.editor.selectionEnd;
        const v = self.editor.value;
        if (start !== end) {
          self.editor.value = v.slice(0, start) + v.slice(end);
          self.editor.setSelectionRange(start, start);
          self.ensureEditorVisible();
          return;
        }
        if (start >= v.length) return;
        const after = [...v.slice(start)];
        after.shift();
        self.editor.value = v.slice(0, start) + after.join('');
        self.editor.setSelectionRange(start, start);
        self.ensureEditorVisible();
      },
      replaceRange(from, to, text) {
        const v = self.editor.value;
        self.editor.value = v.slice(0, from) + text + v.slice(to);
        const pos = from + text.length;
        self.editor.setSelectionRange(pos, pos);
        self.ensureEditorVisible();
      },
      setCandidates(list) { self.setCandidates(list); },
      setComposition(text) { self.setComposition(text); },
    };
  }

  setCandidates(list) {
    this.candidates = list || [];
    if (!this.candidates.length) {
      this.candidateEl.hidden = true;
      this.candidateEl.innerHTML = '';
      return;
    }
    this.candidateEl.hidden = false;
    this.candidateEl.innerHTML = this.candidates.map((c) =>
      `<button type="button" role="option" data-cand="${escapeAttr(c.value)}"><kbd>${c.key}</kbd> ${escapeHtml(c.label)}</button>`
    ).join('');
  }

  setComposition(text) {
    this.composition = text || '';
    if (!this.composition) {
      this.compositionEl.hidden = true;
      this.compositionEl.textContent = '';
      return;
    }
    this.compositionEl.hidden = false;
    this.compositionEl.textContent = `Composing: ${this.composition}`;
  }

  pushHistory() {
    this.history.push(this.editor.value);
  }

  runAction(action) {
    switch (action) {
      case 'undo': {
        const v = this.history.undo(this.editor.value);
        if (v !== null) this.editor.value = v;
        break;
      }
      case 'redo': {
        const v = this.history.redo(this.editor.value);
        if (v !== null) this.editor.value = v;
        break;
      }
      case 'copy':
        this.pushHistory();
        copyText(this.editor.value).then((ok) => this.toast(ok ? 'Copied' : 'Copy failed'));
        break;
      case 'download':
        downloadText(this.editor.value, `${this.config.slug || 'writewithin'}.txt`);
        this.toast('Downloaded');
        break;
      case 'speak':
        speak(this.editor.value, this.lang);
        break;
      case 'clear':
        this.pushHistory();
        this.editor.value = '';
        this.clearSuggestion();
        this.updateRomanization();
        if (this.config.slug) clearDraft(this.config.slug);
        if (this.draftBanner) {
          this.draftBanner.hidden = true;
          this.draftBanner.innerHTML = '';
        }
        this._pendingDraft = null;
        break;
      case 'theme': {
        const next = this.tool.classList.contains('is-dark') ? 'light' : 'dark';
        applySiteTheme(next);
        break;
      }
      case 'dual': {
        const dual = `${this.editor.value}\n${this.romanEl.textContent}`;
        copyText(dual).then(() => this.toast('Dual script copied'));
        break;
      }
      case 'translate': {
        const url = `https://translate.google.com/?sl=${this.lang}&tl=en&text=${encodeURIComponent(this.editor.value)}&op=translate`;
        window.open(url, '_blank', 'noopener');
        break;
      }
      case 'search': {
        const q = this.editor.value.trim() || this.config.name || '';
        window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener');
        break;
      }
      case 'email': {
        const body = encodeURIComponent(this.editor.value);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&body=${body}`, '_blank', 'noopener');
        break;
      }
      case 'wiki': {
        const q = this.editor.value.trim() || this.config.name || '';
        const lang = (this.lang || 'en').slice(0, 2);
        window.open(`https://${lang}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`, '_blank', 'noopener');
        break;
      }
      case 'toggle-en':
        this.english = !this.english;
        this.emojiMode = false;
        this.mobilePane = 'abc';
        this.renderLayoutSwitcher();
        this.renderBoard();
        break;
      case 'emoji':
        this.emojiMode = !this.emojiMode;
        this.mobilePane = this.emojiMode ? 'emoji' : 'abc';
        if (this.emojiMode) this.emojiTab = this.loadRecentEmoji().length ? 'recent' : 'smileys';
        this.renderLayoutSwitcher();
        this.renderBoard();
        break;
      default:
        break;
    }
    this.updateRomanization();
  }

  updateRomanization() {
    const kind = this.romanizer;
    if (!kind || kind === 'none') {
      this.romanEl.textContent = '';
      return;
    }
    this.romanEl.textContent = romanize(this.editor.value, kind);
  }

  renderPractice() {
    if (!this.phrases.length) {
      this.practiceEl.hidden = true;
      return;
    }
    this.practiceEl.hidden = false;
    this.showPracticeItem();
  }

  showPracticeItem() {
    const p = this.phrases[this.practiceIndex % this.phrases.length];
    this.practiceEl.innerHTML = `
      <div class="kb-practice__card">
        <p class="kb-practice__label">Practice phrase</p>
        <p class="kb-practice__target" lang="${this.lang}">${escapeHtml(p.phrase)}</p>
        <p class="kb-practice__meta">${escapeHtml(p.romanization || '')} — ${escapeHtml(p.meaning || '')}</p>
        <div class="kb-practice__stats" data-pstats>Type the phrase above, then press Check.</div>
        <button type="button" class="kb-chip is-accent" data-practice-check>Check</button>
        <button type="button" class="kb-chip" data-practice-next>Next</button>
      </div>
    `;
    this.practiceEl.querySelector('[data-practice-check]')?.addEventListener('click', () => this.checkPractice(true));
    this.practiceEl.querySelector('[data-practice-next]')?.addEventListener('click', () => {
      this.practiceIndex++;
      this.editor.value = '';
      this.showPracticeItem();
    });
  }

  checkPractice(announce = false) {
    const p = this.phrases[this.practiceIndex % this.phrases.length];
    if (!p) return;
    const typed = this.editor.value.trim();
    const ok = typed === p.phrase;
    const stats = this.practiceEl.querySelector('[data-pstats]');
    if (stats && (announce || ok)) {
      stats.textContent = ok ? 'Correct — nice work.' : `Not yet. Target: ${p.phrase}`;
      if (ok) {
        this.practiceIndex++;
        setTimeout(() => {
          this.editor.value = '';
          this.showPracticeItem();
        }, 700);
      }
    }
  }

  rememberRecent() {
    try {
      const key = 'ww-recent-keyboards';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const slug = this.config.slug;
      const next = [slug, ...list.filter((s) => s !== slug)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* ignore */ }
  }

  toast(msg) {
    this.toastEl.hidden = false;
    this.toastEl.textContent = msg;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, 1600);
  }
}

function keyBtn(code, labels) {
  const lab = labels[code] || { main: '', hint: '' };
  return `<button type="button" class="kb-key" data-code="${code}" aria-label="${escapeAttr(lab.main || code)}">
    <span class="kb-key__main">${escapeHtml(lab.main)}</span>
    <span class="kb-key__hint">${escapeHtml(lab.hint)}</span>
  </button>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

function englishLayout() {
  return {
    rows: ROW_CODES.map((row) => row.map((code) => {
      const hint = code.replace('Key', '').replace('Digit', '');
      let n = hint.length === 1 ? hint.toLowerCase() : '';
      const map = {
        Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
        Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      };
      if (map[code]) n = map[code];
      if (code.startsWith('Digit')) n = code.slice(5);
      return { code, n, s: n.toUpperCase(), hint: n };
    })),
  };
}

export async function mountAll(selector = '[data-keyboard]') {
  const roots = [...document.querySelectorAll(selector)];
  await Promise.all(roots.map(async (el) => {
    if (el.__kbMounted) return;
    el.__kbMounted = true;
    try {
      const config = await resolveKeyboardConfig(el);
      new KeyboardApp(el, config);
    } catch (err) {
      el.__kbMounted = false;
      console.error('[WriteWithin] keyboard mount failed', el, err);
      throw err;
    }
  }));
}
