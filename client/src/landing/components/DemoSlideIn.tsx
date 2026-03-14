import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'seatable-demo-slidein-dismissed';

export default function DemoSlideIn() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 60_000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border border-[#E7E5E4] p-6"
        >
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 text-[#78716C] hover:text-[#1C1917] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <Sparkles size={20} className="text-[#9F1239] mb-3" />

          <h3 className="font-serif text-lg font-semibold text-[#1C1917] mb-1">
            This is sample data
          </h3>
          <p className="text-sm text-[#78716C] mb-4">
            Want to see YOUR restaurant here? Setup takes 30 seconds.
          </p>

          <button
            type="button"
            onClick={() => { dismiss(); navigate('/demo/setup'); }}
            className="w-full bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-medium py-2.5 rounded-full transition-colors"
          >
            Set up my restaurant &rarr;
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="w-full text-sm text-[#78716C] hover:text-[#1C1917] mt-2 py-1 transition-colors"
          >
            Maybe later
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
