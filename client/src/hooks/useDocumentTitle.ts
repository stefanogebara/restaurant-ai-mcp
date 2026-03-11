import { useEffect, useRef } from 'react';

/**
 * Sets document.title on mount and restores the previous title on unmount.
 */
export function useDocumentTitle(title: string) {
  const previousTitle = useRef(document.title);

  useEffect(() => {
    previousTitle.current = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle.current;
    };
  }, [title]);
}
