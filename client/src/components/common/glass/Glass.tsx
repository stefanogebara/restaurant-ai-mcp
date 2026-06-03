/**
 * Warm Glass — light-mode glass surface primitives.
 *
 * One source of truth for the four glass tiers spec'd in DESIGN.md so
 * components don't hand-roll backdrop-blur / rgba mixes. Each primitive
 * is a thin <div> with the matching `.glass-*` utility class from
 * index.css + sensible polymorphic `as` support and `className`
 * passthrough for layout/sizing classes.
 *
 * Usage:
 *
 *   <GlassCard className="p-5">…</GlassCard>
 *   <GlassPanel as="section" className="p-6 space-y-4">…</GlassPanel>
 *   <GlassModal role="dialog" aria-modal="true">…</GlassModal>
 *   <GlassPill>{labelText}</GlassPill>
 *
 * DO add layout / padding / typography classes via `className`.
 * DO NOT override the glass background or backdrop-filter via className —
 * that defeats the centralisation. If a surface needs a different tier,
 * pick the right primitive (GlassPanel vs GlassCard etc.).
 */

import { forwardRef } from 'react';
import type { ElementType, ComponentPropsWithoutRef, ReactNode } from 'react';

type AnyHTMLElement = HTMLDivElement | HTMLElement;

interface BaseGlassProps {
  /** Additional layout/spacing classes — never use this to override the
   *  glass background, blur, border or shadow (those live in the
   *  utility class). */
  className?: string;
  children?: ReactNode;
  /** Polymorphic element override. Defaults to `div` for cards and
   *  panels, `aside` for the elevated modal so a11y trees stay sensible. */
  as?: ElementType;
}

type PropsOf<E extends ElementType> = Omit<ComponentPropsWithoutRef<E>, keyof BaseGlassProps>;

/** Standard flow-level card. Use for stat cards, list rows, content
 *  panels — anything that previously used `bg-warm-white border ...
 *  rounded-2xl`. */
export const GlassCard = forwardRef<AnyHTMLElement, BaseGlassProps & PropsOf<'div'>>(
  function GlassCard({ as: Tag = 'div', className = '', children, ...rest }, ref) {
    const cls = `glass-card ${className}`.trim();
    return (
      <Tag ref={ref as never} className={cls} {...rest}>
        {children}
      </Tag>
    );
  },
);

/** Larger surface for sidebar inner regions, dashboard wrappers, multi-
 *  card panels. Slightly more transparent + heavier blur than a card,
 *  20 px radius. Use sparingly — nested glass on glass reads muddy. */
export const GlassPanel = forwardRef<AnyHTMLElement, BaseGlassProps & PropsOf<'div'>>(
  function GlassPanel({ as: Tag = 'section', className = '', children, ...rest }, ref) {
    const cls = `glass-panel ${className}`.trim();
    return (
      <Tag ref={ref as never} className={cls} {...rest}>
        {children}
      </Tag>
    );
  },
);

/** Elevated modal / dialog. More opaque (0.78 vs 0.62) so form fields
 *  and dense copy stay readable. Heavier shadow grounds it above flow.
 *  Defaults `as="div"` because most modal libs (Radix, Headless UI)
 *  expect a div root they can portal. */
export const GlassModal = forwardRef<AnyHTMLElement, BaseGlassProps & PropsOf<'div'>>(
  function GlassModal({ as: Tag = 'div', className = '', children, ...rest }, ref) {
    const cls = `glass-modal ${className}`.trim();
    return (
      <Tag ref={ref as never} className={cls} {...rest}>
        {children}
      </Tag>
    );
  },
);

/** Pill chip — 46 px radius (intentionally not rounded-full per
 *  DESIGN.md). For suggestion chips, status pills, tag filters. */
export const GlassPill = forwardRef<AnyHTMLElement, BaseGlassProps & PropsOf<'span'>>(
  function GlassPill({ as: Tag = 'span', className = '', children, ...rest }, ref) {
    const cls = `glass-pill inline-flex items-center ${className}`.trim();
    return (
      <Tag ref={ref as never} className={cls} {...rest}>
        {children}
      </Tag>
    );
  },
);
