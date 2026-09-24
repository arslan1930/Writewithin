/**
 * Invisible-character helpers shared by Whitespace Cleaner and Character Cleaner.
 * Safe mode touches only zero-width space and BOM; aggressive mode also removes
 * joiners that Arabic and Indic scripts rely on.
 */

export const ZERO_WIDTH_SAFE = /[\u200B\uFEFF]/g;
export const ZERO_WIDTH_AGGRESSIVE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
export const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;
export const SOFT_HYPHEN = /\u00AD/g;

/**
 * @param {string} text
 * @param {'none'|'safe'|'aggressive'} mode
 */
export function stripInvisible(text, mode = 'safe') {
  if (mode === 'aggressive') return text.replace(ZERO_WIDTH_AGGRESSIVE, '');
  if (mode === 'safe') return text.replace(ZERO_WIDTH_SAFE, '');
  return text;
}

/** @param {string} text */
export function stripLeadingBom(text) {
  return text.replace(/^\uFEFF/, '');
}

/** @param {string} text */
export function stripBidiControls(text) {
  return text.replace(BIDI_CONTROLS, '').replace(SOFT_HYPHEN, '');
}
