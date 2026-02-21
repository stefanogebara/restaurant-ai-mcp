/**
 * HelpTooltip Component
 *
 * Displays an info icon with a tooltip explaining metrics and features.
 * Designed for non-tech-savvy restaurant staff to understand analytics.
 */

import { useState } from 'react';
import ThiingsIcon from './ThiingsIcon';

interface HelpTooltipProps {
  content: string;
  title?: string;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
}

export default function HelpTooltip({
  content,
  title,
  className = '',
  position = 'top',
  size = 'md'
}: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const sizePx = {
    sm: 12,
    md: 16,
    lg: 20
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-deep-charcoal border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-deep-charcoal border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-deep-charcoal border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-deep-charcoal border-t-transparent border-b-transparent border-l-transparent'
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-flex items-center justify-center text-stone-gray hover:text-deep-charcoal transition-colors cursor-help focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2 rounded-full"
        aria-label="Help information"
      >
        <ThiingsIcon name="help-circle" pxSize={sizePx[size]} />
      </button>

      {/* Tooltip */}
      {isVisible && (
        <div
          className={`absolute z-50 ${positionClasses[position]} w-64 pointer-events-none`}
          role="tooltip"
        >
          <div className="bg-deep-charcoal text-white text-sm rounded-xl shadow-lg p-3 border border-stone-gray">
            {title && (
              <div className="font-semibold mb-1 text-burgundy">{title}</div>
            )}
            <div className="text-border-gray leading-relaxed whitespace-pre-line">
              {content}
            </div>
            {/* Arrow */}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
