/**
 * WriteWithin — browser entry (no bundler required).
 * Uses native ES modules. Works on any static host.
 */
import './keyboard-engine/index.js';
import './tools/url-cleaner.js';
import './tools/typing-test.js';
import './tools/line-counter.js';
import './tools/case-converter.js';
import './tools/whitespace-cleaner.js';
import './tools/line-tools.js';
import './tools/character-cleaner.js';
import './feedback.js';
import { mountSiteTheme } from './theme.js';
import './site.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountSiteTheme, { once: true });
} else {
  mountSiteTheme();
}
