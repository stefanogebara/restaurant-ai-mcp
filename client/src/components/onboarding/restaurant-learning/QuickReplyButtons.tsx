/**
 * QuickReplyButtons - Suggested Quick Reply Row
 *
 * Outlined burgundy pill buttons for quick responses during the interview.
 *
 * Accessibility:
 * - Wrapped in a <div role="group"> with a visually-connected label.
 * - Each button has an aria-label for screen readers.
 * - Focus ring matches the design system ring style.
 *
 * UX:
 * - Buttons truncate at one line with a generous max-width to avoid
 *   mid-word cuts while still fitting multiple options per row.
 * - Long replies show a title tooltip on hover/focus for full text.
 * - Keys are index-prefixed so a changed reply list won't cause ghost flicker.
 */

import { motion } from 'framer-motion';

interface QuickReplyButtonsProps {
  replies: string[];
  onSelect: (reply: string) => void;
  disabled?: boolean;
}

export default function QuickReplyButtons({ replies, onSelect, disabled }: QuickReplyButtonsProps) {
  if (!replies || replies.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.22, delay: 0.1 }}
      className="space-y-2"
    >
      {/* Label — visually subtle, semantically linked via role="group" below */}
      <p id="quick-replies-label" className="text-xs text-[#A8A29E] font-medium tracking-wide uppercase">
        Quick replies
      </p>

      <div
        role="group"
        aria-labelledby="quick-replies-label"
        className="flex flex-wrap gap-2"
      >
        {replies.map((reply, index) => (
          <button
            key={`${index}-${reply}`}
            type="button"
            onClick={() => onSelect(reply)}
            disabled={disabled}
            aria-label={`Quick reply: ${reply}`}
            title={reply}
            className="
              inline-flex items-center
              px-4 py-2 text-sm font-medium
              max-w-[260px] sm:max-w-[300px]
              text-left truncate
              border-2 border-[#9F1239] text-[#9F1239]
              bg-white
              rounded-full
              hover:bg-[#9F1239]/10
              active:bg-[#9F1239]/15 active:scale-[0.97]
              focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2
              transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
              disabled:hover:bg-white disabled:active:scale-100
            "
          >
            {reply}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
