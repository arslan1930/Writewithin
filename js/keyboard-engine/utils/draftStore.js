const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DRAFT_PREFIX = 'ww-draft:';

export function draftStorageKey(slug) {
  return `${DRAFT_PREFIX}${slug || 'default'}`;
}

/**
 * @returns {{ text: string, savedAt: number } | null}
 */
export function loadDraft(slug) {
  try {
    const raw = localStorage.getItem(draftStorageKey(slug));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.text !== 'string' || !data.savedAt) {
      clearDraft(slug);
      return null;
    }
    if (Date.now() - data.savedAt > DRAFT_TTL_MS) {
      clearDraft(slug);
      return null;
    }
    if (!data.text.trim()) {
      clearDraft(slug);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveDraft(slug, text) {
  try {
    const trimmed = String(text ?? '');
    if (!trimmed.trim()) {
      // Never wipe an existing draft from an empty editor (e.g. beforeunload on refresh).
      // Use clearDraft() / syncDraft() for intentional clears.
      return;
    }
    localStorage.setItem(draftStorageKey(slug), JSON.stringify({
      text: trimmed,
      savedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

/** Save or clear based on current editor text after the user has edited. */
export function syncDraft(slug, text) {
  try {
    const trimmed = String(text ?? '');
    if (!trimmed.trim()) {
      clearDraft(slug);
      return;
    }
    saveDraft(slug, trimmed);
  } catch {
    /* ignore */
  }
}

export function clearDraft(slug) {
  try {
    localStorage.removeItem(draftStorageKey(slug));
  } catch {
    /* ignore */
  }
}

export function formatDraftAge(savedAt) {
  const mins = Math.max(1, Math.round((Date.now() - savedAt) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return 'earlier';
}
