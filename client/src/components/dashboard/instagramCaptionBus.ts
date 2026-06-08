/**
 * Tiny pub/sub for shuttling a drafted caption from the feed-post
 * DraftCard to the Reel panel without prop-drilling through
 * InstagramPanel. Uses CustomEvent on window — no React context, no
 * external store dep.
 *
 * Producer (DraftCard "Send to Reel" button):
 *   sendCaptionToReel("today's special: wood-fired pizza")
 *
 * Consumer (InstagramReelPanel useEffect):
 *   const unsubscribe = subscribeReelCaption((caption) => { ... });
 *   return () => unsubscribe();
 */

const EVENT_NAME = 'instagram:caption-to-reel';

export function sendCaptionToReel(caption: string): void {
  if (typeof window === 'undefined' || typeof caption !== 'string') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { caption } }));
}

export function subscribeReelCaption(handler: (caption: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (evt: Event) => {
    const detail = (evt as CustomEvent<{ caption: string }>).detail;
    if (detail && typeof detail.caption === 'string') handler(detail.caption);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
