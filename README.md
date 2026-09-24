# WriteWithin

Privacy-first online multilingual keyboards and writing tools (https://writewithin.com/).

## Mobile keyboard fix

On phones and tablets, focusing the editor used to open the **OS soft keyboard on top of the sticky on-screen board**, which hid the caret and typed text.

The keyboard engine now:

- Sets `inputmode="none"` on the editor
- Uses a short `readonly` focus guard on touch devices so the OS keyboard stays closed
- Keeps the caret scrolled into view above the sticky board
- Falls back via `visualViewport`: if an OS keyboard still appears, the site board collapses so typed text remains visible

### Local check

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/keyboard-mobile-test.html` in a mobile browser or DevTools device mode.
