'use strict';
// R3 — voice/portal validator time zone. Clock frozen at 17:00 in São Paulo
// (20:00 UTC) on Tue 2026-11-24. Oracle (manual): a São Paulo restaurant open
// 18:00-23:00 must ACCEPT tonight 20:00 (3 h ahead), and must REJECT tonight
// 17:30 (30 min ahead: under the 1 h minimum notice).
// Run once with TZ=UTC (the platform default for serverless functions) and
// once with TZ=America/Sao_Paulo as the control.
const path = require('path');
const RealDate = Date;
const FROZEN = RealDate.parse('2026-11-24T20:00:00Z');
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FROZEN])); }
  static now() { return FROZEN; }
};
const { validateReservation } = require(path.join(process.env.AUDIT_REPO || path.resolve(__dirname, '../..'), 'api/_lib/reservation-validator.js'));
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const restaurant = { business_hours: hours, timezone: 'America/Sao_Paulo' };
(async () => {
  const cases = [['2026-11-24', '19:00', 'accept'], ['2026-11-24', '20:30', 'accept'], ['2026-11-24', '20:00', 'accept'], ['2026-11-24', '17:30', 'reject'], ['2026-11-25', '19:00', 'accept']];
  for (const [date, time, expected] of cases) {
    const r = await validateReservation({ date, time, party_size: 2 }, restaurant);
    const ok = r.valid !== false && !(r.errors || []).length;
    console.log(JSON.stringify({ TZ: process.env.TZ, slot: `${date} ${time}`, expected, observed: ok ? 'accept' : `reject:${(r.errors || []).map(e => e.code).join(',')}`, match: (ok ? 'accept' : 'reject') === expected }));
  }
})().catch(e => { console.error(e); process.exit(2); });
