import { describe, it, expect } from 'vitest';
import { isDayHoursValid } from '../Step2Contact';

describe('isDayHoursValid', () => {
  it('accepts normal same-day hours (close after open)', () => {
    expect(isDayHoursValid('12:00', '23:00')).toBe(true);
    expect(isDayHoursValid('07:00', '15:00')).toBe(true);
  });

  it('accepts a midnight (00:00) close — the backend treats it as end-of-day', () => {
    // api/portal.js explicitly maps close_time '00:00' to 24:00. The UI must
    // not block it: a restaurant that closes at midnight has to onboard.
    expect(isDayHoursValid('18:00', '00:00')).toBe(true);
    expect(isDayHoursValid('11:30', '00:00')).toBe(true);
  });

  it('rejects close == open', () => {
    expect(isDayHoursValid('19:00', '19:00')).toBe(false);
  });

  it('rejects general overnight hours (close before open, not midnight)', () => {
    // 18:00 → 02:00 is genuinely unsupported by the slot generator downstream
    // (it would produce zero bookable slots), so it must stay blocked here.
    expect(isDayHoursValid('18:00', '02:00')).toBe(false);
    expect(isDayHoursValid('20:00', '01:30')).toBe(false);
  });
});
