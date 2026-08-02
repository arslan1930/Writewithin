import { mountAll } from './KeyboardApp.js';

const bootKeyboards = () => {
  mountAll('[data-keyboard-root], [data-keyboard]').catch((err) => {
    console.error('[WriteWithin] keyboard boot failed', err);
  });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootKeyboards, { once: true });
} else {
  bootKeyboards();
}

function applyKeyboardPickerFilters() {
  const search = document.querySelector('[data-hub-search]');
  const items = [...document.querySelectorAll('[data-kb-item]')];
  if (!items.length) return;

  const activeFilter = document.querySelector('[data-home-filters] .is-active')?.dataset.filter || 'all';
  const q = (search?.value || '').trim().toLowerCase();
  const popularBlock = document.querySelector('[data-popular-block]');
  if (popularBlock) {
    popularBlock.hidden = q !== '';
    popularBlock.style.display = q !== '' ? 'none' : '';
  }

  let visible = 0;

  items.forEach((el) => {
    const inHiddenPopularBlock = q !== '' && !!el.closest('[data-popular-block]');
    const hay = (el.dataset.kbItem || '').toLowerCase();
    const script = el.dataset.kbScript || '';
    const popular = el.dataset.kbPopular === '1';
    const matchesQuery = !q || hay.includes(q);
    let matchesFilter = true;
    if (activeFilter === 'popular') matchesFilter = popular;
    else if (activeFilter.startsWith('script:')) matchesFilter = script === activeFilter.slice(7);

    const show = !inHiddenPopularBlock && matchesQuery && matchesFilter;
    el.hidden = !show;
    // Author CSS sets cards to display:grid, which can override the browser's
    // native [hidden] rule. Set display explicitly so live search always works.
    el.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });

  const status = document.querySelector('[data-picker-status]');
  if (status) {
    if (visible === 0) {
      status.hidden = false;
      status.textContent = 'No keyboards match. Try another search or filter.';
    } else if (q || activeFilter !== 'all') {
      status.hidden = false;
      status.textContent = `${visible} keyboard${visible === 1 ? '' : 's'} found`;
    } else {
      status.hidden = true;
      status.textContent = '';
    }
  }
}

const search = document.querySelector('[data-hub-search]');
if (search) {
  search.addEventListener('input', applyKeyboardPickerFilters);
  applyKeyboardPickerFilters();
}

document.querySelector('[data-home-picker-form]')?.addEventListener('submit', (e) => {
  e.preventDefault();
  document.getElementById('keyboards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  applyKeyboardPickerFilters();
});

document.querySelectorAll('[data-home-filters] [data-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-home-filters] [data-filter]').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    applyKeyboardPickerFilters();
  });
});
