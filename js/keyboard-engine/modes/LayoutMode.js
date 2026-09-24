export class LayoutMode {
  constructor(layoutJson, config = {}) {
    this.layout = layoutJson;
    this.config = config;
    this.deadKeys = config.dead_keys || {};
    this.pendingDead = null;
    this.keyIndex = this.buildIndex();
  }

  buildIndex() {
    const index = {};
    for (const row of this.layout.rows || []) {
      for (const key of row) {
        index[key.code] = key;
      }
    }
    return index;
  }

  getLabel(code, { shift = false } = {}) {
    const key = this.keyIndex[code];
    if (!key) return '';
    return shift ? (key.s || key.n) : key.n;
  }

  onKey(code, ctx) {
    if (code === 'Space') {
      this.pendingDead = null;
      ctx.insert(' ');
      return true;
    }
    if (code === 'Enter') {
      this.pendingDead = null;
      ctx.insert('\n');
      return true;
    }
    if (code === 'Backspace') {
      this.pendingDead = null;
      ctx.backspace();
      return true;
    }
    if (code === 'Tab') {
      ctx.insert('\t');
      return true;
    }

    const key = this.keyIndex[code];
    if (!key) return false;

    const isLetter = code.startsWith('Key') && code.length === 4;
    const useShift = ctx.shift || (ctx.caps && isLetter);
    let ch = useShift ? (key.s || key.n) : key.n;
    if (!ch) return false;

    if (this.pendingDead && this.deadKeys[this.pendingDead]) {
      const mapped = this.deadKeys[this.pendingDead][ch];
      if (mapped) {
        ctx.insert(mapped);
        this.pendingDead = null;
        return true;
      }
      ctx.insert(this.pendingDead + ch);
      this.pendingDead = null;
      return true;
    }

    if (this.deadKeys[ch]) {
      this.pendingDead = ch;
      return true;
    }

    ctx.insert(ch);
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
