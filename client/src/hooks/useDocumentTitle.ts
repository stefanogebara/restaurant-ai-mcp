import { useEffect } from 'react';

const DEFAULT_TITLE = 'seatable - Gestão de Restaurantes com IA';

/**
 * Sets document.title on mount and restores the default on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
