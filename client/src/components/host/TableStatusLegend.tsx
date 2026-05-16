import StatusLegend, { type StatusLegendItem } from '../common/StatusLegend';

/**
 * Floor-plan table status legend. Used to use a hand-rolled palette where
 * "available" was rose and "occupied" was burgundy — the available state
 * looked alarming and the occupied state looked like a primary CTA. Now
 * delegates to the shared <StatusLegend /> with semantic tokens.
 */
const ITEMS: StatusLegendItem[] = [
  { label: 'settings.tableStatus.available', token: 'good' },     // emerald = ready for guests
  { label: 'settings.tableStatus.occupied',  token: 'active' },   // blue = in service / dining
  { label: 'settings.tableStatus.cleaning',  token: 'warn' },     // amber = transitioning
  { label: 'settings.tableStatus.reserved',  token: 'neutral' },  // stone = held, no action yet
];

export default function TableStatusLegend() {
  return <StatusLegend items={ITEMS} caption="settings.tableStatusLabel" />;
}
