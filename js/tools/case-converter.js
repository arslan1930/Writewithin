function transform(text, mode) {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*\w|[.!?…]\s*\w)/g, (c) => c.toUpperCase());
    case 'toggle':
      return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    default:
      return text;
  }
}

function initCaseConverter() {
  const root = document.getElementById('case-converter');
  if (!root || root.__mounted) return;
  root.__mounted = true;

  const input = root.querySelector('[data-cc-input]');
  const output = root.querySelector('[data-cc-output]');
  const toast = root.querySelector('[data-cc-toast]');
  let mode = 'upper';

  function run() {
    output.value = transform(input.value, mode);
  }

  function flash(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    setTimeout(() => { toast.hidden = true; }, 1400);
  }

  root.querySelectorAll('[data-cc-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.ccMode;
      root.querySelectorAll('[data-cc-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      run();
    });
  });
  input.addEventListener('input', run);
  root.querySelector('[data-cc-clear]')?.addEventListener('click', () => {
    input.value = '';
    run();
  });
  root.querySelector('[data-cc-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      flash('Copied');
    } catch {
      flash('Copy failed');
    }
  });
  run();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCaseConverter, { once: true });
} else {
  initCaseConverter();
}
