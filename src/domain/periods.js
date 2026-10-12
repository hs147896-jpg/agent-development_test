const pad = (value) => String(value).padStart(2, '0');

export function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function lastDay(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export const PERIOD_LABELS = {
  day: '일간',
  week: '주간',
  month: '월간',
  quarter: '분기',
  half: '반기',
  year: '연간',
};

export function getPeriodRange(unit, referenceDate) {
  const ref = localDate(referenceDate);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  let start;
  let end;

  if (unit === 'day') {
    start = new Date(year, month, ref.getDate());
    end = new Date(start);
  } else if (unit === 'week') {
    const mondayOffset = (ref.getDay() + 6) % 7;
    start = new Date(year, month, ref.getDate() - mondayOffset);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if (unit === 'quarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    start = new Date(year, firstMonth, 1);
    end = new Date(year, firstMonth + 2, lastDay(year, firstMonth + 2));
  } else if (unit === 'half') {
    const firstMonth = month < 6 ? 0 : 6;
    start = new Date(year, firstMonth, 1);
    end = new Date(year, firstMonth + 5, lastDay(year, firstMonth + 5));
  } else if (unit === 'year') {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  } else {
    start = new Date(year, month, 1);
    end = new Date(year, month, lastDay(year, month));
  }

  return { start: toDateString(start), end: toDateString(end) };
}

export function datesBetween(start, end) {
  const result = [];
  const cursor = localDate(start);
  const last = localDate(end);
  while (cursor <= last) {
    result.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function monthsBetween(start, end) {
  const first = localDate(`${start.slice(0, 7)}-01`);
  const last = localDate(`${end.slice(0, 7)}-01`);
  const months = [];
  while (first <= last) {
    months.push(`${first.getFullYear()}-${pad(first.getMonth() + 1)}`);
    first.setMonth(first.getMonth() + 1);
  }
  return months;
}
