/** QWERTY legends for phonetic / IME boards (physical key → Latin label). */
const SPECIALS = {
  Backquote: ['`', '~'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
};

export function latinKeyLabels({ shift = false, caps = false } = {}) {
  const labels = {};
  for (let i = 0; i <= 9; i++) {
    const code = `Digit${i}`;
    const shifted = [')', '!', '@', '#', '$', '%', '^', '&', '*', '('][i];
    labels[code] = { main: shift ? shifted : String(i), hint: '' };
  }
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i);
    const code = `Key${letter.toUpperCase()}`;
    const upper = shift || caps;
    labels[code] = { main: upper ? letter.toUpperCase() : letter, hint: '' };
  }
  for (const [code, [n, s]] of Object.entries(SPECIALS)) {
    labels[code] = { main: shift ? s : n, hint: '' };
  }
  return labels;
}

export function codeToLatin(code, { shift = false, caps = false } = {}) {
  if (code.startsWith('Key') && code.length === 4) {
    const c = code.slice(3).toLowerCase();
    return shift || caps ? c.toUpperCase() : c;
  }
  if (code.startsWith('Digit') && code.length === 6) {
    const d = code.slice(5);
    if (shift) {
      return [')', '!', '@', '#', '$', '%', '^', '&', '*', '('][Number(d)] || d;
    }
    return d;
  }
  const pair = SPECIALS[code];
  if (pair) return shift ? pair[1] : pair[0];
  return null;
}

export function isLetterCode(code) {
  return code.startsWith('Key') && code.length === 4;
}
