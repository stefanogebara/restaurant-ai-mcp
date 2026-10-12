/** The IANA timezone remains the persisted value; only its displayed current
 * offset changes with daylight-saving time. */
export function currentTimezoneLabel(timeZone: string, city: string, offsetNow: string, now = new Date()): string {
  try {
    const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(now).find(part => part.type === 'timeZoneName')?.value;
    return offset ? `${city} (${offset} ${offsetNow})` : city;
  } catch {
    return city;
  }
}

export function localizedCountryName(code: string, fallback: string, language: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return fallback;
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code.toUpperCase()) || fallback;
  } catch {
    return fallback;
  }
}
