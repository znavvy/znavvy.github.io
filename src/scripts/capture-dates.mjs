/** Pure presentation helpers: dates belong to selected offers, never another variant. */

function isValidCalendarDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() + 1 === m &&
    check.getUTCDate() === d
  );
}

export function validCaptureDate(value) {
  if (typeof value !== 'string') return false;

  // 1. Date-only format: YYYY-MM-DD
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const y = Number(dateOnlyMatch[1]);
    const m = Number(dateOnlyMatch[2]);
    const d = Number(dateOnlyMatch[3]);
    return isValidCalendarDate(y, m, d);
  }

  // 2. ISO timestamp with MANDATORY timezone indicator (Z or offset [+-]HH:MM)
  // Timestamps without timezone are rejected so machine local timezone is never silently assumed.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!isoMatch) return false;

  const y = Number(isoMatch[1]);
  const m = Number(isoMatch[2]);
  const d = Number(isoMatch[3]);
  if (!isValidCalendarDate(y, m, d)) return false;

  const hh = Number(isoMatch[4]);
  const mm = Number(isoMatch[5]);
  const ss = Number(isoMatch[6]);
  if (hh > 23 || mm > 59 || ss > 59) return false;

  const tz = isoMatch[7];
  if (tz !== 'Z') {
    const offHour = Math.abs(Number(tz.slice(1, 3)));
    if (offHour > 23) return false;
    const cleanTz = tz.replace(':', '');
    if (cleanTz.length === 5) {
      const offMin = Number(cleanTz.slice(3, 5));
      if (offMin > 59) return false;
    }
  }

  const date = new Date(value);
  return !Number.isNaN(date.valueOf());
}

export function formatCaptureDate(value) {
  if (!validCaptureDate(value)) return 'Tanggal pemeriksaan belum tersedia';
  if (!value.includes('T')) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  const date = new Date(value);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export function captureDateSummary(offers) {
  if (!Array.isArray(offers)) return { first: null, last: null, missing: 0 };
  const dates = offers
    .map(o => o.scrape_date)
    .filter(validCaptureDate)
    .sort((a, b) => new Date(a.includes('T') ? a : a + 'T00:00:00Z').getTime() - new Date(b.includes('T') ? b : b + 'T00:00:00Z').getTime());
  return {
    first: dates[0] || null,
    last: dates.at(-1) || null,
    missing: offers.length - dates.length,
  };
}
