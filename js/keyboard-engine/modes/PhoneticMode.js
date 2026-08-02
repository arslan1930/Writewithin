import { codeToLatin, latinKeyLabels, isLetterCode } from '../utils/latinLabels.js';

export class PhoneticMode {
  constructor(phoneticJson = {}, config = {}) {
    this.map = phoneticJson.map || {};
    this.telex = !!phoneticJson.telex;
    this.tones = phoneticJson.tones || {};
    this.buffer = '';
    this.config = config;
    this.keys = Object.keys(this.map).sort((a, b) => b.length - a.length);
  }

  reset() {
    this.buffer = '';
  }

  onKey(code, ctx) {
    if (code === 'Space') {
      this.flush(ctx);
      ctx.insert(' ');
      return true;
    }
    if (code === 'Enter') {
      this.flush(ctx);
      ctx.insert('\n');
      return true;
    }
    if (code === 'Backspace') {
      if (ctx.selectionStart !== ctx.selectionEnd) {
        this.reset();
        ctx.setComposition('');
        ctx.setCandidates([]);
        ctx.backspace();
        return true;
      }
      if (this.buffer.length) {
        this.buffer = this.buffer.slice(0, -1);
        ctx.setComposition(this.buffer);
        ctx.setCandidates(this.candidates());
        return true;
      }
      ctx.backspace();
      return true;
    }

    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      const list = this.candidates();
      if (n >= 1 && n <= list.length) {
        this.commitCandidate(ctx, list[n - 1].value);
        return true;
      }
    }

    // Shift (not Caps) produces uppercase map keys like Arabic H / Hindi T
    const letter = codeToLatin(code, {
      shift: ctx.shift || (ctx.caps && isLetterCode(code)),
      caps: false,
    });
    if (!letter) return false;

    if (this.telex) {
      return this.handleTelex(letter, ctx);
    }

    if (!/[a-zA-Z']/.test(letter)) {
      this.flush(ctx);
      const mapped = this.map[letter] ?? this.map[letter.toLowerCase()];
      ctx.insert(mapped || letter);
      ctx.setComposition('');
      ctx.setCandidates([]);
      return true;
    }

    this.buffer += letter;
    this.drain(ctx, false);
    ctx.setComposition(this.buffer);
    ctx.setCandidates(this.candidates());
    return true;
  }

  drain(ctx, force) {
    while (this.buffer) {
      if (!force && this.canGrow(this.buffer)) break;

      const match = this.longestPrefix(this.buffer);
      if (match) {
        ctx.insert(match.value);
        this.buffer = this.buffer.slice(match.key.length);
        continue;
      }

      ctx.insert(this.buffer[0]);
      this.buffer = this.buffer.slice(1);
    }
  }

  canGrow(buf) {
    return this.keys.some((k) => {
      if (k.length <= buf.length) return false;
      if (k.startsWith(buf)) return true;
      // lowercase keys may grow from lowercase buffer
      if (k === k.toLowerCase() && k.startsWith(buf.toLowerCase())) return true;
      return false;
    });
  }

  longestPrefix(buf) {
    // Prefer exact (case-sensitive) matches first — Hindi T≠t, Arabic H≠h
    for (const key of this.keys) {
      if (buf.startsWith(key) && this.map[key] !== undefined) {
        return { key, value: this.applyCase(this.map[key], buf.slice(0, key.length)) };
      }
    }
    const lower = buf.toLowerCase();
    for (const key of this.keys) {
      if (key !== key.toLowerCase()) continue;
      if (lower.startsWith(key) && this.map[key] !== undefined) {
        return { key, value: this.applyCase(this.map[key], buf.slice(0, key.length)) };
      }
    }
    return null;
  }

  handleTelex(letter, ctx) {
    if (this.tones[letter.toLowerCase()]) {
      const tone = this.tones[letter.toLowerCase()];
      const text = ctx.value;
      for (let i = text.length - 1; i >= 0; i--) {
        if (/[aeiouyăâêôơưAEIOUYĂÂÊÔƠƯ]/.test(text[i])) {
          const composed = (text[i] + tone).normalize('NFC');
          ctx.replaceRange(i, i + 1, composed);
          return true;
        }
      }
      return true;
    }

    this.buffer += letter;
    for (const key of this.keys) {
      if (this.buffer.toLowerCase().endsWith(key.toLowerCase())) {
        const before = this.buffer.slice(0, -key.length);
        if (before) ctx.insert(before);
        ctx.insert(this.map[key]);
        this.buffer = '';
        ctx.setComposition('');
        return true;
      }
    }
    if (this.buffer.length > 2) {
      ctx.insert(this.buffer[0]);
      this.buffer = this.buffer.slice(1);
    }
    ctx.setComposition(this.buffer);
    return true;
  }

  flush(ctx) {
    if (!this.buffer) {
      ctx.setComposition('');
      ctx.setCandidates([]);
      return;
    }
    this.drain(ctx, true);
    if (this.buffer) {
      ctx.insert(this.buffer);
      this.buffer = '';
    }
    ctx.setComposition('');
    ctx.setCandidates([]);
  }

  commitCandidate(ctx, value) {
    ctx.insert(value);
    this.buffer = '';
    ctx.setComposition('');
    ctx.setCandidates([]);
  }

  applyCase(value, typed) {
    if (typeof value !== 'string' || !typed) return value;
    const wantUpper = typed[0] === typed[0].toUpperCase() && typed[0] !== typed[0].toLowerCase();
    if (wantUpper && value.length === 1) return value.toLocaleUpperCase();
    return value;
  }

  candidates() {
    if (!this.buffer) return [];
    const lower = this.buffer.toLowerCase();
    return this.keys
      .filter((k) => k.startsWith(this.buffer) || (k === k.toLowerCase() && k.startsWith(lower)))
      .slice(0, 8)
      .map((k, i) => ({ key: String(i + 1), label: `${k} → ${this.map[k]}`, value: this.map[k] }));
  }

  getKeyLabels(state) {
    return latinKeyLabels(state);
  }
}
