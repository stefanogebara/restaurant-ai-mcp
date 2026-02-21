import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  SkeletonStatCard,
  SkeletonReservationRow,
  SkeletonTableCard,
  SkeletonActiveParty,
  DashboardSkeleton,
} from '../Skeleton';

describe('Skeleton', () => {
  it('renders with base classes', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-[#E7E5E4]');
    expect(el.className).toContain('rounded');
  });

  it('applies additional className', () => {
    const { container } = render(<Skeleton className="w-10 h-10" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('w-10');
    expect(el.className).toContain('h-10');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SkeletonStatCard', () => {
  it('renders a skeleton stat card with aria-hidden', () => {
    const { container } = render(<SkeletonStatCard />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('rounded-xl');
  });

  it('contains skeleton elements inside', () => {
    const { container } = render(<SkeletonStatCard />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SkeletonReservationRow', () => {
  it('renders a skeleton reservation row with aria-hidden', () => {
    const { container } = render(<SkeletonReservationRow />);
    const row = container.firstChild as HTMLElement;
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row.className).toContain('border-b');
  });

  it('contains skeleton elements for avatar, text, and badge', () => {
    const { container } = render(<SkeletonReservationRow />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    // Avatar (rounded-full), name, subtitle, badge = at least 4
    expect(pulseElements.length).toBeGreaterThanOrEqual(3);
  });
});

describe('SkeletonTableCard', () => {
  it('renders a skeleton table card', () => {
    const { container } = render(<SkeletonTableCard />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('rounded-xl');
  });

  it('contains multiple skeleton placeholders', () => {
    const { container } = render(<SkeletonTableCard />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(4);
  });
});

describe('SkeletonActiveParty', () => {
  it('renders a skeleton active party item', () => {
    const { container } = render(<SkeletonActiveParty />);
    const item = container.firstChild as HTMLElement;
    expect(item).toHaveAttribute('aria-hidden', 'true');
    expect(item.className).toContain('rounded-lg');
  });

  it('contains skeleton elements', () => {
    const { container } = render(<SkeletonActiveParty />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(2);
  });
});

describe('DashboardSkeleton', () => {
  it('renders with a loading status role and label', () => {
    render(<DashboardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading dashboard...');
  });

  it('renders stat card skeletons in the stats grid', () => {
    const { container } = render(<DashboardSkeleton />);
    // The stats grid is the first grid inside the status container
    const grids = container.querySelectorAll('.grid');
    // First grid is the stats grid with 6 stat cards
    const statsGrid = grids[0];
    expect(statsGrid).toBeDefined();
    const statCards = statsGrid.children;
    expect(statCards.length).toBe(4);
  });

  it('renders table card skeletons inside the table grid', () => {
    const { container } = render(<DashboardSkeleton />);
    // The second grid is the table cards grid with 10 items
    const grids = container.querySelectorAll('.grid');
    // grids[0] = stats grid (6 items), grids[1] = table cards grid (10 items)
    const tableGrid = grids[1];
    expect(tableGrid).toBeDefined();
    expect(tableGrid.children.length).toBe(10);
  });
});
