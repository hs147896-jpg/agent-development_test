'use client';

import { PERIOD_LABELS } from '@/domain/periods';

export function PeriodControls({ unit, onUnitChange, referenceDate, onDateChange }) {
  return (
    <div className="period-controls" aria-label="조회 기간">
      <div className="segmented">
        {Object.entries(PERIOD_LABELS).map(([value, label]) => (
          <button type="button" key={value} className={unit === value ? 'selected' : ''} onClick={() => onUnitChange(value)}>{label}</button>
        ))}
      </div>
      <label className="date-control">
        기준 날짜
        <input type="date" value={referenceDate} onChange={(event) => onDateChange(event.target.value)} />
      </label>
    </div>
  );
}
