/** Shared site chrome: mobile nav, locale navigation, service worker */

const LOCALES = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
  ar: 'العربية', hi: 'हिन्दी', zh: '中文', ja: '日本語', ko: '한국어',
  ru: 'Русский', ur: 'اردو', tr: 'Türkçe', id: 'Indonesia', it: 'Italiano', fa: 'فارسی',
};

const LOCALE_CODES = Object.keys(LOCALES).filter((c) => c !== 'en');

function setLocaleCookie(code) {
  document.cookie = `ww_locale=${encodeURIComponent(code)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

/** Current UI locale from path (/es/…) or html[lang]. */
function localeFromPath() {
  const seg = window.location.pathname.split('/').filter(Boolean)[0];
  if (seg && LOCALES[seg] && seg !== 'en') return seg;
  return 'en';
}

/** Convert current path to another locale’s equivalent URL. */
function pathForLocale(targetLocale) {
  const { pathname, search, hash } = window.location;
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] && LOCALE_CODES.includes(parts[0])) {
    parts.shift();
  }
  const rest = parts.length ? `/${parts.join('/')}/` : '/';
  if (!targetLocale || targetLocale === 'en') {
    return `${rest === '//' ? '/' : rest}${search}${hash}`;
  }
  return `/${targetLocale}${rest === '/' ? '/' : rest}${search}${hash}`;
}

function mountMobileNav() {
  const btn = document.querySelector('[data-ww-nav-toggle]');
  const nav = document.querySelector('[data-ww-nav]');
  if (!btn || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    btn.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('ww-nav-open', open);
  };

  btn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const mq = window.matchMedia('(min-width: 901px)');
  const onMq = () => { if (mq.matches) setOpen(false); };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else mq.addListener(onMq);
}

function mountLocaleSelect() {
  const sel = document.getElementById('ww-locale');
  if (!sel) return;

  const current = localeFromPath();
  // Options may be locale codes or full URLs — prefer data-locale / value codes
  [...sel.options].forEach((o) => {
    const code = o.dataset.locale || o.value;
    o.selected = code === current || o.value === pathForLocale(current);
  });

  sel.addEventListener('change', () => {
    const opt = sel.selectedOptions[0];
    const code = opt?.dataset.locale || opt?.value;
    if (!code || !LOCALES[code]) {
      // value is already a path
      if (opt?.value?.startsWith('/')) {
        setLocaleCookie(localeFromPath());
        window.location.href = opt.value;
      }
      return;
    }
    setLocaleCookie(code);
    window.location.href = pathForLocale(code);
  });
}

/** Prefill hub search from ?q= and apply filters. */
function mountSearchPrefill() {
  const search = document.querySelector('[data-hub-search]');
  if (!search) return;
  try {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      search.value = q;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch { /* ignore */ }
}

function mountLangMenu() {
  const menus = [...document.querySelectorAll('[data-ww-lang-menu]')];
  if (!menus.length) return;

  document.addEventListener('click', (e) => {
    menus.forEach((menu) => {
      if (!menu.open) return;
      if (!menu.contains(e.target)) menu.open = false;
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((menu) => { menu.open = false; });
  });
}

function boot() {
  mountMobileNav();
  mountLocaleSelect();
  mountSearchPrefill();
  mountLangMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
