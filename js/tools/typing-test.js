function parseSentences(root) {
  try {
    return JSON.parse(root.dataset.sentences || '[]');
  } catch {
    return [];
  }
}

function initTypingTest() {
  const root = document.getElementById('typing-test');
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const sentences = parseSentences(root);
  const promptEl = root.querySelector('[data-tt-prompt]');
  const input = root.querySelector('[data-tt-input]');
  const wpmEl = root.querySelector('[data-tt-wpm]');
  const accEl = root.querySelector('[data-tt-acc]');
  const timeEl = root.querySelector('[data-tt-time]');
  const restart = root.querySelector('[data-tt-restart]');

  let index = 0;
  let startedAt = null;
  let timer = null;

  function pick() {
    if (!sentences.length) {
      promptEl.textContent = 'No sentences available.';
      return '';
    }
    const s = sentences[index % sentences.length];
    promptEl.textContent = s;
    return s;
  }

  function reset() {
    startedAt = null;
    clearInterval(timer);
    timer = null;
    input.value = '';
    index = (index + 1) % Math.max(sentences.length, 1);
    pick();
    update(0, 100, 0);
    input.focus();
  }

  function update(wpm, acc, secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    wpmEl.textContent = `${wpm} WPM`;
    accEl.textContent = `${acc}% acc`;
    timeEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function score() {
    const target = promptEl.textContent || '';
    const typed = input.value;
    if (!typed) {
      update(0, 100, startedAt ? (Date.now() - startedAt) / 1000 : 0);
      return;
    }
    if (!startedAt) {
      startedAt = Date.now();
      timer = setInterval(() => score(), 200);
    }
    let correct = 0;
    const len = typed.length;
    for (let i = 0; i < len; i++) {
      if (typed[i] === target[i]) correct++;
    }
    const secs = Math.max((Date.now() - startedAt) / 1000, 0.001);
    const wpm = Math.round((typed.length / 5) / (secs / 60));
    const acc = Math.round((correct / len) * 100);
    update(wpm, acc, secs);
    if (typed === target && target.length) {
      clearInterval(timer);
      timer = null;
    }
  }

  pick();
  input.addEventListener('input', score);
  restart?.addEventListener('click', reset);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTypingTest, { once: true });
} else {
  initTypingTest();
}
