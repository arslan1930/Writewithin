// On-device next-word prediction and word completion.
// Nothing leaves the browser: the model is seeded from the page's own phrase
// list plus a small English core, then adapts to whatever the user types.

const STORE_PREFIX = 'ww-predict-';
const MAX_UNIGRAMS = 1500;
const MAX_BIGRAM_HEADS = 700;
const MAX_NEXT_PER_HEAD = 6;
const WORD_RE = /[\p{L}\p{M}\p{N}'’]+/gu;

// Scripts without spaces between words, where prefix completion is meaningless
// and the IME candidate row already does this job.
const SPACELESS_SCRIPTS = new Set(['han', 'japanese', 'chinese']);

const EN_CORE = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not',
  'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
  'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all',
  'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who',
  'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
  'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good',
  'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
  'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want',
  'because', 'any', 'these', 'give', 'day', 'most', 'us', 'thanks', 'thank',
  'please', 'hello', 'message', 'email', 'keyboard', 'language', 'write',
  'typing', 'friend', 'family', 'today', 'tomorrow', 'morning', 'night',
  'really', 'something', 'someone', 'everything', 'together', 'question',
  'answer', 'welcome', 'sorry', 'again', 'always', 'never', 'before',
  'should', 'through', 'where', 'while', 'still', 'every', 'much', 'many',
];

const EN_PAIRS = [
  ['thank', 'you'], ['how', 'are'], ['are', 'you'], ['i', 'am'], ['i', 'will'],
  ['see', 'you'], ['let', 'me'], ['me', 'know'], ['good', 'morning'],
  ['good', 'night'], ['nice', 'to'], ['to', 'meet'], ['meet', 'you'],
  ['what', 'is'], ['is', 'the'], ['in', 'the'], ['of', 'the'], ['on', 'the'],
  ['to', 'the'], ['for', 'the'], ['at', 'the'], ['this', 'is'], ['it', 'is'],
  ['we', 'are'], ['they', 'are'], ['there', 'is'], ['do', 'you'], ['can', 'you'],
  ['would', 'like'], ['looking', 'forward'], ['talk', 'soon'], ['take', 'care'],
];

function tokenize(text) {
  return String(text || '').toLowerCase().match(WORD_RE) || [];
}

function bumpNested(map, head, next, weight) {
  if (!map[head]) map[head] = {};
  map[head][next] = (map[head][next] || 0) + weight;
}

function trimNested(map) {
  const heads = Object.keys(map);
  if (heads.length > MAX_BIGRAM_HEADS) {
    heads
      .map((h) => [h, Object.values(map[h]).reduce((a, b) => a + b, 0)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, heads.length - MAX_BIGRAM_HEADS)
      .forEach(([h]) => delete map[h]);
  }
  Object.keys(map).forEach((head) => {
    const entries = Object.entries(map[head]);
    if (entries.length <= MAX_NEXT_PER_HEAD) return;
    map[head] = Object.fromEntries(
      entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_NEXT_PER_HEAD)
    );
  });
}

function trimFlat(map) {
  const entries = Object.entries(map);
  if (entries.length <= MAX_UNIGRAMS) return map;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_UNIGRAMS));
}

export class Predictor {
  constructor({ slug = '', script = '', languageCode = '', phrases = [] } = {}) {
    this.slug = slug;
    this.key = STORE_PREFIX + (slug || 'default');
    this.enabled = !SPACELESS_SCRIPTS.has(String(script).toLowerCase());
    this.unigrams = Object.create(null);
    this.bigrams = Object.create(null);
    this._learnedPrefix = '';
    this._lastWord = '';
    this._dirty = false;

    this.restore();
    this.seed(phrases, languageCode);
  }

  seed(phrases, languageCode) {
    EN_CORE.forEach((w, i) => {
      // Earlier entries are more common, so give them a gentle head start.
      this.unigrams[w] = Math.max(this.unigrams[w] || 0, 3 + Math.round((EN_CORE.length - i) / 40));
    });
    EN_PAIRS.forEach(([a, b]) => bumpNested(this.bigrams, a, b, 4));

    // Only the phrase itself: a phrase's meaning is a translation, not text
    // the user would ever type next to it.
    (phrases || []).forEach((p) => this.absorb(p?.phrase, 3));
    if (String(languageCode).toLowerCase().startsWith('en')) {
      EN_CORE.forEach((w) => { this.unigrams[w] = (this.unigrams[w] || 0) + 1; });
    }
  }

  absorb(text, weight = 1) {
    const words = tokenize(text);
    words.forEach((w, i) => {
      if (w.length < 2) return;
      this.unigrams[w] = (this.unigrams[w] || 0) + weight;
      const prev = words[i - 1];
      if (prev && prev.length >= 1) bumpNested(this.bigrams, prev, w, weight);
    });
  }

  // Learn only the words finished since the last call. Text the user keeps
  // extending is consumed once; an edit further back replays that text once.
  learn(text) {
    if (!this.enabled) return;
    const value = String(text || '');
    const extending = this._learnedPrefix && value.startsWith(this._learnedPrefix);
    const tail = extending ? value.slice(this._learnedPrefix.length) : value;
    let prev = extending ? this._lastWord : '';

    const partial = (value.match(/[\p{L}\p{M}\p{N}'’]+$/u) || [''])[0];
    this._learnedPrefix = value.slice(0, value.length - partial.length);

    const words = tokenize(tail);
    const complete = /[\p{L}\p{M}\p{N}'’]$/u.test(tail) ? words.slice(0, -1) : words;
    if (!complete.length) return;

    complete.forEach((w) => {
      if (w.length >= 2) this.unigrams[w] = (this.unigrams[w] || 0) + 2;
      if (prev) bumpNested(this.bigrams, prev, w, 3);
      prev = w;
    });
    this._lastWord = prev;
    this._dirty = true;
  }

  completion(prefix) {
    if (prefix.length < 2) return '';
    let best = '';
    let bestScore = 0;
    for (const word in this.unigrams) {
      if (word.length <= prefix.length || !word.startsWith(prefix)) continue;
      const score = this.unigrams[word] - (word.length - prefix.length) * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = word;
      }
    }
    return best ? best.slice(prefix.length) : '';
  }

  nextWord(prevWord) {
    const nexts = prevWord ? this.bigrams[prevWord] : null;
    if (!nexts) return '';
    let best = '';
    let bestScore = 2; // Ignore one-off pairs so the ghost stays trustworthy.
    for (const word in nexts) {
      if (nexts[word] > bestScore) {
        bestScore = nexts[word];
        best = word;
      }
    }
    return best;
  }

  // Returns { type, text } for the text left of the caret, or null.
  suggest(before) {
    if (!this.enabled || !before) return null;

    const partial = (before.match(/[\p{L}\p{M}\p{N}'’]+$/u) || [''])[0];
    if (partial) {
      const rest = this.completion(partial.toLowerCase());
      if (!rest) return null;
      return { type: 'completion', text: rest };
    }

    if (/[ \n]$/.test(before)) {
      const words = tokenize(before);
      const next = this.nextWord(words[words.length - 1]);
      if (next) return { type: 'next', text: next };
    }
    return null;
  }

  restore() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(this.unigrams, data.u || {});
      Object.assign(this.bigrams, data.b || {});
    } catch { /* corrupt or unavailable storage — start fresh */ }
  }

  persist() {
    if (!this._dirty) return;
    try {
      this.unigrams = trimFlat(this.unigrams);
      trimNested(this.bigrams);
      localStorage.setItem(this.key, JSON.stringify({ u: this.unigrams, b: this.bigrams }));
      this._dirty = false;
    } catch { /* quota or private mode — predictions simply stay in memory */ }
  }
}
