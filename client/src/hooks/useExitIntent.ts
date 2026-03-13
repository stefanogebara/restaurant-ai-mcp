import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'seatable-exit-intent-shown';

/**
 * Detects exit intent on desktop (mouse leaves viewport top)
 * and shows popup once per session.
 */
export function useExitIntent(enabled = true) {
  const [showPopup, setShowPopup] = useState(false);
  const handlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const alreadyShown = sessionStorage.getItem(STORAGE_KEY);
    if (alreadyShown) return;

    // Delay activation — don't trigger for users who just arrived
    const activationTimer = setTimeout(() => {
      const handleMouseLeave = (e: MouseEvent) => {
        if (e.clientY <= 0) {
          sessionStorage.setItem(STORAGE_KEY, 'true');
          setShowPopup(true);
          document.removeEventListener('mouseleave', handleMouseLeave);
          handlerRef.current = null;
        }
      };

      handlerRef.current = handleMouseLeave;
      document.addEventListener('mouseleave', handleMouseLeave);
    }, 5000);

    return () => {
      clearTimeout(activationTimer);
      if (handlerRef.current) {
        document.removeEventListener('mouseleave', handlerRef.current);
        handlerRef.current = null;
      }
    };
  }, [enabled]);

  const dismiss = useCallback(() => {
    setShowPopup(false);
  }, []);

  return { showPopup, dismiss };
}
