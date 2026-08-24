import { describe, it, expect } from 'vitest';
import { getStatusStyle as editorStyle, STATUS_STYLES } from '../floorPlanConstants';
import { getStatusStyle as mesaStyle } from '../../host/floorPlanHelpers';

/**
 * The floor-plan editor and the dashboard used to keep two independent
 * palettes, so the same table was emerald/violet in one screen and
 * burgundy/amber in the other. These assertions fail the moment anyone
 * re-forks them.
 */
describe('table palette is shared between editor and dashboard', () => {
  const statuses = ['Available', 'Occupied', 'Reserved', 'Being Cleaned', 'Whatever'];

  it.each(statuses)('resolves %s identically on both surfaces', (status) => {
    expect(editorStyle(status)).toEqual(mesaStyle(status));
  });

  it('keeps the semantic anchors of the illustrated tables', () => {
    // Occupied is the brand burgundy fill (plates read as white on it);
    // reserved is dashed amber; free is quiet glass, never an alarm colour.
    expect(STATUS_STYLES.occupied.fill).toBe('#9F1239');
    expect(STATUS_STYLES.reserved.stroke).toBe('#D97706');
    expect(STATUS_STYLES.reserved.dash).toBeTruthy();
    expect(STATUS_STYLES.available.dash).toBeUndefined();
    expect(STATUS_STYLES.available.fill).not.toBe('#9F1239');
  });

  it('has a night variant that only the dashboard opts into', () => {
    expect(mesaStyle('Occupied', true).fill).toBe('#9F1239');
    expect(mesaStyle('Available', true).fill).not.toBe(mesaStyle('Available').fill);
  });
});
