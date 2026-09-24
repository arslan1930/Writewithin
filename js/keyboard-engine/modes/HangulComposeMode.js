const INITIALS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const MEDIALS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const FINALES = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const COMPLEX_MEDIAL = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
  'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
  'ㅡㅣ': 'ㅢ',
};

const COMPLEX_FINAL = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
  'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
  'ㅂㅅ': 'ㅄ',
};

function isJamo(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x3131 && c <= 0x318e;
}

function isInitial(ch) { return INITIALS.includes(ch); }
function isMedial(ch) { return MEDIALS.includes(ch); }
function isFinal(ch) { return FINALES.includes(ch) && ch !== ''; }

function compose(L, V, T = '') {
  const li = INITIALS.indexOf(L);
  const vi = MEDIALS.indexOf(V);
  const ti = FINALES.indexOf(T);
  if (li < 0 || vi < 0 || ti < 0) return L + V + T;
  return String.fromCodePoint(0xac00 + li * 588 + vi * 28 + ti);
}

function decompose(ch) {
  const code = ch.codePointAt(0);
  if (code < 0xac00 || code > 0xd7a3) return [ch];
  const s = code - 0xac00;
  const L = INITIALS[Math.floor(s / 588)];
  const V = MEDIALS[Math.floor((s % 588) / 28)];
  const T = FINALES[s % 28];
  return T ? [L, V, T] : [L, V];
}

export class HangulComposeMode {
  constructor(layoutJson) {
    this.layoutMode = null;
    this.layoutJson = layoutJson;
    // lazy import avoided — use key map directly
    this.keyIndex = {};
    for (const row of layoutJson.rows || []) {
      for (const key of row) this.keyIndex[key.code] = key;
    }
  }

  onKey(code, ctx) {
    if (code === 'Space') { ctx.insert(' '); return true; }
    if (code === 'Enter') { ctx.insert('\n'); return true; }
    if (code === 'Backspace') return this.onBackspace(ctx);

    const key = this.keyIndex[code];
    if (!key) return false;
    const isLetter = code.startsWith('Key') && code.length === 4;
    const useShift = ctx.shift || (ctx.caps && isLetter);
    const jamo = useShift ? (key.s || key.n) : key.n;
    if (!jamo || !isJamo(jamo)) {
      ctx.insert(jamo || '');
      return true;
    }
    return this.composeInput(jamo, ctx);
  }

  composeInput(jamo, ctx) {
    const text = ctx.value;
    const pos = ctx.selectionStart;
    const prev = pos > 0 ? text[pos - 1] : '';

    if (!prev) {
      ctx.insert(jamo);
      return true;
    }

    // If previous is syllable, decompose mentally
    const parts = (prev.codePointAt(0) >= 0xac00 && prev.codePointAt(0) <= 0xd7a3)
      ? decompose(prev)
      : isJamo(prev) ? [prev] : null;

    if (!parts) {
      ctx.insert(jamo);
      return true;
    }

    if (parts.length === 1 && isInitial(parts[0]) && isMedial(jamo)) {
      ctx.replaceRange(pos - 1, pos, compose(parts[0], jamo));
      return true;
    }

    if (parts.length === 2) {
      const [L, V] = parts;
      const complexV = COMPLEX_MEDIAL[V + jamo];
      if (complexV) {
        ctx.replaceRange(pos - 1, pos, compose(L, complexV));
        return true;
      }
      if (isFinal(jamo)) {
        ctx.replaceRange(pos - 1, pos, compose(L, V, jamo));
        return true;
      }
      if (isInitial(jamo)) {
        ctx.insert(jamo);
        return true;
      }
    }

    if (parts.length === 3) {
      const [L, V, T] = parts;
      const complexT = COMPLEX_FINAL[T + jamo];
      if (complexT) {
        ctx.replaceRange(pos - 1, pos, compose(L, V, complexT));
        return true;
      }
      if (isMedial(jamo) && isInitial(T)) {
        // move final to new syllable initial
        ctx.replaceRange(pos - 1, pos, compose(L, V) + compose(T, jamo));
        return true;
      }
      if (isInitial(jamo)) {
        ctx.insert(jamo);
        return true;
      }
    }

    ctx.insert(jamo);
    return true;
  }

  onBackspace(ctx) {
    // Selected range (including Select All) must clear fully
    if (ctx.selectionStart !== ctx.selectionEnd) {
      ctx.backspace();
      return true;
    }
    const text = ctx.value;
    const pos = ctx.selectionStart;
    if (pos === 0) return true;
    const prev = [...text.slice(0, pos)].pop();
    if (!prev) {
      ctx.backspace();
      return true;
    }
    const code = prev.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const parts = decompose(prev);
      parts.pop();
      let replacement = '';
      if (parts.length === 1) replacement = parts[0];
      else if (parts.length === 2) replacement = compose(parts[0], parts[1]);
      else if (parts.length === 3) replacement = compose(parts[0], parts[1], parts[2]);
      ctx.replaceRange(pos - prev.length, pos, replacement);
      return true;
    }
    ctx.backspace();
    return true;
  }

  getKeyLabels(state) {
    const labels = {};
    for (const [code, key] of Object.entries(this.keyIndex)) {
      const isLetter = code.startsWith('Key') && code.length === 4;
      const useShift = state.shift || (state.caps && isLetter);
      labels[code] = {
        main: useShift ? (key.s || key.n) : key.n,
        hint: key.hint || '',
      };
    }
    return labels;
  }
}
