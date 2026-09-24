/** Sitewide light/dark theme — shared by header, keyboards, and tools. */

export function getTheme() {
  try {
    return localStorage.getItem('ww-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** @param {'light'|'dark'} theme */
export function applySiteTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('ww-theme', t);
  } catch {
    /* ignore */
  }
  document.querySelectorAll('.kb-tool').forEach((el) => {
    el.classList.toggle('is-dark', t === 'dark');
  });
  document.querySelectorAll('[data-ww-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    btn.title = t === 'dark' ? 'Light theme' : 'Dark theme';
  });
}

export function toggleSiteTheme() {
  applySiteTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function mountSiteTheme() {
  applySiteTheme(getTheme());
  document.querySelectorAll('[data-ww-theme-toggle]').forEach((btn) => {
    if (btn.__themeMounted) return;
    btn.__themeMounted = true;
    btn.addEventListener('click', () => toggleSiteTheme());
  });
}
