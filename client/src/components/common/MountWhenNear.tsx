import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders its children only when they come near the viewport.
 *
 * Built for the dashboard's lower widgets (notes, revenue, staffing,
 * messages): each one starts its own API call when it mounts, and on load they
 * competed with the calls the first screen needs (measured 2026-11-21: 10
 * calls per dashboard load, 5 of them for widgets below the fold).
 *
 * Without IntersectionObserver (old browsers, jsdom in tests) the children
 * mount at once, so nothing is ever hidden for good.
 */
export default function MountWhenNear({ children, rootMargin = '300px', placeholderHeight = 320 }: {
  children: ReactNode;
  /** How far below the viewport to start mounting. */
  rootMargin?: string;
  /** Space kept while waiting, so the page does not jump. */
  placeholderHeight?: number;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near || !anchor.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  if (near) return <>{children}</>;
  return <div ref={anchor} style={{ minHeight: placeholderHeight }} aria-hidden="true" data-testid="mount-when-near" />;
}
