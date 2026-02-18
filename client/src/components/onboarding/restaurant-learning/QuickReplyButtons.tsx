/**
 * QuickReplyButtons - Suggested Quick Reply Row
 *
 * Outlined burgundy buttons for quick responses during the interview.
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
      transition={{ duration: 0.25, delay: 0.15 }}
      className="space-y-2"
    >
      <p className="text-xs text-[#A8A29E] font-medium">Quick replies</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reply suggestions">
        {replies.map((reply, index) => (
          <button
            key={`${reply}-${index}`}
            type="button"
            onClick={() => onSelect(reply)}
            disabled={disabled}
            aria-label={`Quick reply: ${reply}`}
            className="
              px-4 py-2 text-sm font-medium max-w-[220px] text-left
              border border-[#9F1239] text-[#9F1239]
              rounded-full
              hover:bg-[#9F1239]/10
              focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2
              transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {reply}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
