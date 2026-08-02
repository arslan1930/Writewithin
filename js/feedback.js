const SUPPORT_EMAIL = 'support@writewithin.com';

function buildMailto(subject, body) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function pageContext() {
  return [
    `Page: ${window.location.href}`,
    `Browser: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n');
}

function openMail(subject, body) {
  window.location.href = buildMailto(subject, body);
}

function createEl(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html != null) el.innerHTML = html;
  return el;
}

function mountFeedbackWidget() {
  if (document.getElementById('ww-feedback')) return;

  const root = createEl('div', 'ww-feedback');
  root.id = 'ww-feedback';

  const fab = createEl('button', 'ww-feedback__fab');
  fab.type = 'button';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'ww-feedback-panel');
  fab.title = 'Suggestions & errors';
  fab.innerHTML = '<span aria-hidden="true">💬</span><span class="ww-feedback__fab-label">Feedback</span>';

  const panel = createEl('div', 'ww-feedback__panel');
  panel.id = 'ww-feedback-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Send feedback');
  panel.innerHTML = `
    <div class="ww-feedback__head">
      <strong>Suggestions &amp; errors</strong>
      <button type="button" class="ww-feedback__close" aria-label="Close">&times;</button>
    </div>
    <p class="ww-feedback__hint">Tell us about a bug, idea, or change. Opens your email to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    <label class="ww-feedback__label" for="ww-feedback-type">Type</label>
    <select id="ww-feedback-type" class="ww-feedback__select">
      <option value="Suggestion">Suggestion</option>
      <option value="Error / bug">Error / bug</option>
      <option value="Site change">Site change</option>
      <option value="Other">Other</option>
    </select>
    <label class="ww-feedback__label" for="ww-feedback-msg">Message</label>
    <textarea id="ww-feedback-msg" class="ww-feedback__msg" rows="4" placeholder="What should we know?"></textarea>
    <button type="button" class="ww-btn ww-btn--primary ww-feedback__send">Send by email</button>
  `;

  root.append(fab, panel);
  document.body.appendChild(root);

  const close = () => {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    panel.querySelector('#ww-feedback-msg')?.focus();
  };

  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.querySelector('.ww-feedback__close')?.addEventListener('click', close);

  panel.querySelector('.ww-feedback__send')?.addEventListener('click', () => {
    const type = /** @type {HTMLSelectElement} */ (panel.querySelector('#ww-feedback-type'))?.value || 'Feedback';
    const msg = /** @type {HTMLTextAreaElement} */ (panel.querySelector('#ww-feedback-msg'))?.value?.trim() || '';
    if (!msg) {
      panel.querySelector('#ww-feedback-msg')?.focus();
      return;
    }
    const subject = `[WriteWithin] ${type}`;
    const body = `${msg}\n\n---\n${pageContext()}`;
    openMail(subject, body);
    close();
  });
}

function mountCrashReporter() {
  if (document.getElementById('ww-crash')) return;

  let lastKey = '';
  let lastAt = 0;
  let open = false;

  const overlay = createEl('div', 'ww-crash');
  overlay.id = 'ww-crash';
  overlay.hidden = true;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ww-crash-title');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="ww-crash__card">
      <h2 id="ww-crash-title">Something went wrong</h2>
      <p>Sorry — we hit a problem on this page. You can report it to us so we can fix it.</p>
      <pre class="ww-crash__detail" data-ww-crash-detail hidden></pre>
      <div class="ww-crash__actions">
        <button type="button" class="ww-btn ww-btn--primary" data-ww-crash-report>Report problem</button>
        <a class="ww-btn ww-btn--ghost" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
        <button type="button" class="ww-btn ww-btn--ghost" data-ww-crash-dismiss>Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let pendingError = '';

  const show = (message) => {
    const key = String(message || '').slice(0, 200);
    const now = Date.now();
    if (key && key === lastKey && now - lastAt < 30000) return;
    lastKey = key;
    lastAt = now;
    pendingError = message || 'Unknown error';
    const detail = overlay.querySelector('[data-ww-crash-detail]');
    if (detail) {
      detail.textContent = pendingError;
      detail.hidden = false;
    }
    open = true;
    overlay.hidden = false;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  };

  const hide = () => {
    open = false;
    overlay.hidden = true;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  };

  overlay.querySelector('[data-ww-crash-dismiss]')?.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  overlay.querySelector('[data-ww-crash-report]')?.addEventListener('click', () => {
    const subject = '[WriteWithin] Problem report';
    const body = [
      'A problem occurred while using WriteWithin.',
      '',
      'What happened (optional):',
      '',
      '---',
      `Error: ${pendingError}`,
      pageContext(),
    ].join('\n');
    openMail(subject, body);
    hide();
  });

  const isNoise = (msg) => {
    const s = String(msg || '');
    if (/Script error\.?$/i.test(s)) return true;
    if (/ResizeObserver loop/i.test(s)) return true;
    if (/Loading CSS chunk/i.test(s)) return true;
    if (/Failed to fetch dynamically imported module/i.test(s)) return true;
    return false;
  };

  window.addEventListener('error', (event) => {
    const msg = event?.error?.stack || event?.message || 'Script error';
    if (isNoise(msg)) return;
    if (/Script error\.?$/i.test(String(event?.message || '')) && !event?.error) return;
    show(String(msg).slice(0, 1200));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = reason?.stack || reason?.message || String(reason || 'Unhandled promise rejection');
    if (isNoise(msg)) return;
    show(String(msg).slice(0, 1200));
  });

  // Escape closes popup so header stays usable
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) hide();
  });
}

export function mountSupport() {
  mountFeedbackWidget();
  mountCrashReporter();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSupport);
  } else {
    mountSupport();
  }
}
