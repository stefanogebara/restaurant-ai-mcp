/** Portuguese abbreviations for weekday names */
const PT_ABBREV: Record<string, string> = {
  Monday: 'Seg', Tuesday: 'Ter', Wednesday: 'Qua', Thursday: 'Qui',
  Friday: 'Sex', Saturday: 'Sáb', Sunday: 'Dom',
  Mon: 'Seg', Tue: 'Ter', Wed: 'Qua', Thu: 'Qui',
  Fri: 'Sex', Sat: 'Sáb', Sun: 'Dom',
};

/**
 * Returns a Portuguese abbreviation for a given English day name
 * (accepts both full names like "Monday" and abbreviations like "Mon").
 * Falls back to the input string if no match is found.
 */
export function getDayAbbrevPt(englishDay: string): string {
  return PT_ABBREV[englishDay] || englishDay;
}
