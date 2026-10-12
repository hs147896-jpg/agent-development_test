export function won(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '계산 불가';
  return `${value < 0 ? '-' : ''}₩${Math.abs(Math.round(value)).toLocaleString('ko-KR')}`;
}

export function number(value, maximumFractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits });
}

export function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '계산 불가';
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
}
