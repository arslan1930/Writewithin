function initLineCounter() {
  const root = document.getElementById('line-counter');
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-lc-input]');
  const linesEl = root.querySelector('[data-lc-lines]');
  const wordsEl = root.querySelector('[data-lc-words]');
  const charsEl = root.querySelector('[data-lc-chars]');
  const sentEl = root.querySelector('[data-lc-sentences]');
  const toast = root.querySelector('[data-lc-toast]');

  function count() {
    const text = input.value;
    const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
    const words = (text.trim().match(/\S+/g) || []).length;
    const chars = text.length;
    const sentences = (text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || []).filter((s) => s.trim()).length;
    linesEl.textContent = `${lines} lines`;
    wordsEl.textContent = `${words} words`;
    charsEl.textContent = `${chars} chars`;
    sentEl.textContent = `${sentences} sentences`;
  }

  function flash(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    setTimeout(() => { toast.hidden = true; }, 1400);
  }

  input.addEventListener('input', count);
  root.querySelector('[data-lc-clear]')?.addEventListener('click', () => {
    input.value = '';
    count();
  });
  root.querySelector('[data-lc-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      flash('Copied');
    } catch {
      flash('Copy failed');
    }
  });
  count();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLineCounter, { once: true });
} else {
  initLineCounter();
}
