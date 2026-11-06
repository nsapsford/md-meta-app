import { useEffect } from 'react';

// One-shot "the first screen has real content" signal for the launch splash.
// Pages call useFirstContent(hasData) and the splash starts its exit as soon
// as any page reports content (cached or fresh), instead of after a fixed hold.

let ready = false;
const listeners = new Set<() => void>();

export function markFirstContent() {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
  listeners.clear();
}

export function onFirstContent(listener: () => void): () => void {
  if (ready) {
    listener();
    return () => {};
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Report that this page has something worth showing (data, or a final error). */
export function useFirstContent(hasContent: boolean) {
  useEffect(() => {
    if (hasContent) markFirstContent();
  }, [hasContent]);
}
