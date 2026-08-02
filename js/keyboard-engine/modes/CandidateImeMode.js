import { codeToLatin, latinKeyLabels, isLetterCode } from '../utils/latinLabels.js';

const GEMINATE = new Set(['k', 's', 't', 'p', 'b', 'g', 'd', 'z', 'c', 'f', 'h', 'j', 'm', 'r', 'w', 'y']);

export class CandidateImeMode {
  constructor(phoneticJson = {}, config = {}) {
    this.dictionary = phoneticJson.dictionary || {};
    this.map = phoneticJson.map || {};
    this.buffer = '';
    this.candidates = [];
    this.config = config;
    this.isRomaji = !!(phoneticJson.map && Object.keys(phoneticJson.map).length)
      && !phoneticJson.dictionary;
    if (config.ime === 'pinyin' || phoneticJson.dictionary) {
      this.isRomaji = false;
    }
    if (config.script_out === 'hiragana' || config.script_out === 'katakana') {
      this.isRomaji = true;
    }
    this.keys = Object.keys(this.map).sort((a, b) => b.length - a.length);
    this.smallTsu = config.script_out === 'katakana' ? 'ッ' : 'っ';
  }

  reset() {
    this.buffer = '';
    this.candidates = [];
  }

  onKey(code, ctx) {
    if (code === 'Space') {
      if (this.candidates.length) {
        this.commit(ctx, this.candidates[0].value);
        return true;
      }
      this.flush(ctx);
      ctx.insert(' ');
      return true;
    }
    if (code === 'Enter') {
      if (this.candidates.length) {
        this.commit(ctx, this.candidates[0].value);
        return true;
      }
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
      if (this.buffer) {
        this.buffer = this.buffer.slice(0, -1);
        if (this.isRomaji) {
          ctx.setComposition(this.buffer);
          ctx.setCandidates([]);
        } else {
          this.updateCandidates(ctx);
        }
        return true;
      }
      ctx.backspace();
      return true;
    }

    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (n >= 1 && n <= this.candidates.length) {
        this.commit(ctx, this.candidates[n - 1].value);
        return true;
      }
    }

    const ch = codeToLatin(code, {
      shift: ctx.shift,
      caps: ctx.caps && isLetterCode(code),
    });
    if (!ch) return false;

    if (!/[a-zA-Z-]/.test(ch)) {
      this.flush(ctx);
      ctx.insert(ch);
      return true;
    }

    this.buffer += ch.toLowerCase();

    if (this.isRomaji) {
      return this.handleRomaji(ctx, false);
    }

    this.updateCandidates(ctx);
    return true;
  }

  handleRomaji(ctx, force) {
    let guard = 0;
    while (this.buffer && guard++ < 32) {
      // Small tsu: kk, ss, tt, …
      if (this.buffer.length >= 2) {
        const a = this.buffer[0];
        const b = this.buffer[1];
        if (a === b && GEMINATE.has(a) && a !== 'n') {
          ctx.insert(this.smallTsu);
          this.buffer = this.buffer.slice(1);
          continue;
        }
      }

      // nn / n' → ん
      // "nni" → ん+に (one n as ん); bare "nn" waits (may become n+na-row)
      if (this.buffer.startsWith("n'")) {
        ctx.insert(this.map.nn || this.map.n || 'ん');
        this.buffer = this.buffer.slice(2);
        continue;
      }
      if (this.buffer.startsWith('nn')) {
        if (this.buffer.length === 2 && !force) break;
        const third = this.buffer[2];
        if (third && 'aiueoy'.includes(third)) {
          ctx.insert(this.map.n || 'ん');
          this.buffer = this.buffer.slice(1);
          continue;
        }
        ctx.insert(this.map.nn || this.map.n || 'ん');
        this.buffer = this.buffer.slice(2);
        continue;
      }

      // n before a consonant that cannot start na/ni/nu/ne/no/ny…
      if (this.buffer[0] === 'n' && this.buffer.length >= 2) {
        const next = this.buffer[1];
        if (!'aiueoyn'.includes(next) && !this.canGrow('n' + next)) {
          ctx.insert(this.map.n || 'ん');
          this.buffer = this.buffer.slice(1);
          continue;
        }
      }

      if (!force && this.canGrow(this.buffer)) break;

      const match = this.longestPrefix(this.buffer);
      if (match) {
        // Avoid committing lone "n" while it can still grow (unless forced)
        if (!force && match.key === 'n' && this.canGrow('n')) break;
        ctx.insert(match.value);
        this.buffer = this.buffer.slice(match.key.length);
        continue;
      }

      // Unmatched latin — leave in composition until force flush
      if (!force) break;
      ctx.insert(this.buffer[0]);
      this.buffer = this.buffer.slice(1);
    }

    ctx.setComposition(this.buffer);
    ctx.setCandidates([]);
    return true;
  }

  canGrow(slice) {
    return this.keys.some((g) => g.startsWith(slice) && g.length > slice.length);
  }

  longestPrefix(buf) {
    for (const key of this.keys) {
      if (buf.startsWith(key) && this.map[key]) {
        return { key, value: this.map[key] };
      }
    }
    return null;
  }

  updateCandidates(ctx) {
    const list = [];
    if (this.dictionary[this.buffer]) {
      const vals = this.dictionary[this.buffer];
      (Array.isArray(vals) ? vals : [vals]).forEach((v, i) => {
        list.push({ key: String(i + 1), label: v, value: v });
      });
    }
    Object.entries(this.dictionary).forEach(([k, vals]) => {
      if (k.startsWith(this.buffer) && k !== this.buffer) {
        const arr = Array.isArray(vals) ? vals : [vals];
        arr.slice(0, 2).forEach((v) => {
          if (list.length < 9 && !list.find((c) => c.value === v)) {
            list.push({ key: String(list.length + 1), label: `${v} (${k})`, value: v });
          }
        });
      }
    });
    this.candidates = list.slice(0, 9);
    ctx.setComposition(this.buffer);
    ctx.setCandidates(this.candidates);
  }

  commit(ctx, value) {
    ctx.insert(value);
    this.buffer = '';
    this.candidates = [];
    ctx.setComposition('');
    ctx.setCandidates([]);
  }

  commitCandidate(ctx, value) {
    this.commit(ctx, value);
  }

  flush(ctx) {
    if (this.isRomaji) {
      this.handleRomaji(ctx, true);
      if (this.buffer) {
        ctx.insert(this.buffer);
        this.buffer = '';
      }
    } else if (this.buffer) {
      if (this.candidates[0]) ctx.insert(this.candidates[0].value);
      else ctx.insert(this.buffer);
    }
    this.reset();
    ctx.setComposition('');
    ctx.setCandidates([]);
  }

  getKeyLabels(state) {
    return latinKeyLabels(state);
  }
}
