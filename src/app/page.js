'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCafeData } from '@/components/DataProvider';
import { PeriodControls } from '@/components/PeriodControls';
import { StatusView } from '@/components/StatusView';
import { percent, won } from '@/components/Format';
import { calculatePerformance } from '@/domain/calculations';
import { PERIOD_LABELS } from '@/domain/periods';

export default function PerformancePage() {
  const { data, status, message, reload, toggleClose } = useCafeData();
  const [unit, setUnit] = useState('month');
  const [referenceDate, setReferenceDate] = useState('2026-09-18');
  const [closeDate, setCloseDate] = useState('2026-09-19');

  useEffect(() => {
    if (data?.meta?.as_of) setReferenceDate((value) => value || data.meta.as_of);
  }, [data]);

  const result = useMemo(() => data ? calculatePerformance(data, unit, referenceDate) : null, [data, unit, referenceDate]);
  if (!data || !result) return <StatusView status={status} message={message} onRetry={reload} />;

  const latestClosed = data.calendar.filter((item) => item.record_complete).map((item) => item.date).sort().at(-1);
  const closeRecord = data.calendar.find((item) => item.date === closeDate);
  const activeDays = result.daily.filter((item) => item.is_open);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">실시간 실적 및 손익 집계</p>
          <h1>기간별 실적 및 실제 손익</h1>
          <p className="subtle">마감한 날짜의 실제 기록만 집계합니다. 미마감 날짜는 0원이 아니라 집계에서 제외됩니다.</p>
        </div>
        <div className="dataset-badge"><span>자료 기준일</span><strong>{data.meta.as_of}</strong><small>{data.meta.version}</small></div>
      </section>

      <section className="status-strip">
        <div className="latest-close"><span className="status-dot ok" /> 최근 마감일 <strong>{latestClosed ?? '마감 없음'}</strong></div>
        {result.unclosed.length ? (
          <div className="warning-text"><strong>{result.unclosed[0].date} ~ {result.unclosed.at(-1).date}</strong> 미마감 {result.unclosed.length}일 — 해당 날짜는 실적 합계에서 제외</div>
        ) : <div className="success-text">선택 기간이 모두 마감되었습니다.</div>}
      </section>

      <section className="control-card">
        <PeriodControls unit={unit} onUnitChange={setUnit} referenceDate={referenceDate} onDateChange={setReferenceDate} />
        <p className="range-summary"><strong>{PERIOD_LABELS[unit]}</strong> {result.range.start} ~ {result.range.end}<br /><span>실제 포함: {result.closedRange ? `${result.closedRange.start} ~ ${result.closedRange.end} (${result.closedCount}일)` : '마감된 자료 없음'}</span></p>
      </section>

      <section className="metric-grid">
        <Metric index="01" label="순매출" value={won(result.netSales)} note={`할인 ${won(result.discount)}`} accent="blue" />
        <Metric index="02" label="직접 원가" value={won(result.direct)} note={`원가율 ${result.netSales ? percent(result.direct / result.netSales * 100) : '계산 불가'}`} accent="yellow" />
        <Metric index="03" label="매장 운영비" value={won(result.operatingExpenses)} note={result.plan === null ? '일·주간은 월 계획을 나누지 않음' : `월 비용 계획 참고 ${won(result.plan)}`} accent="blue" />
        <Metric index="04" label="실제 영업이익" value={won(result.operatingProfit)} note={`이익률 ${percent(result.margin)}`} accent={result.operatingProfit >= 0 ? 'green' : 'red'} />
      </section>

      <section className="section-block">
        <div className="section-title"><h2>01. 일자별 손익 및 마감 내역</h2><span>단위: 원(KRW)</span></div>
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>날짜</th><th>마감 상태</th><th>판매수량</th><th>순매출</th><th>결제수수료</th><th>식재료비</th><th>포장비</th><th>운영비</th><th>영업이익</th><th>비고</th></tr></thead>
            <tbody>
              {activeDays.map((row) => row.closed ? (
                <tr key={row.date}><td className="strong">{row.date}</td><td><span className="tag ok">마감 완료</span></td><td>{row.quantity.toLocaleString('ko-KR')}</td><td>{won(row.netSales)}</td><td>{won(row.paymentFee)}</td><td>{won(row.food)}</td><td>{won(row.packaging)}</td><td>{won(row.operatingExpenses)}</td><td className={row.operatingProfit >= 0 ? 'positive' : 'negative'}>{won(row.operatingProfit)}</td><td>{row.note || '—'}</td></tr>
              ) : (
                <tr key={row.date} className="unclosed-row"><td className="strong">{row.date}</td><td><span className="tag error">미마감</span></td><td colSpan="7">집계 제외 — 기록 완료 여부를 확인해 주세요.</td><td>{row.note || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column">
        <div className="section-block">
          <div className="section-title"><h2>02. 판매 채널별 실적</h2><span>매장 vs 포장</span></div>
          <div className="channel-grid">
            {result.channels.map((channel) => (
              <article className="channel-card" key={channel.channel}>
                <div className="card-kicker"><strong>{channel.channel}</strong><span>{percent(channel.share)}</span></div>
                <h3>{won(channel.netSales)}</h3>
                <p>판매 {channel.quantity.toLocaleString('ko-KR')}개 · 공헌이익 <b>{won(channel.contribution)}</b></p>
                <dl><div><dt>식재료비</dt><dd>{won(channel.food)}</dd></div><div><dt>포장비</dt><dd>{won(channel.packaging)}</dd></div><div><dt>결제수수료</dt><dd>{won(channel.paymentFee)}</dd></div></dl>
              </article>
            ))}
          </div>
        </div>

        <div className="section-block close-manager">
          <div className="section-title"><h2>03. 영업일 마감 관리</h2><span>브라우저에 저장</span></div>
          <label>마감할 날짜<input type="date" value={closeDate} min={data.meta.start_date} max={data.calendar.at(-1)?.date} onChange={(event) => setCloseDate(event.target.value)} /></label>
          {!closeRecord ? <p className="form-error">영업 달력에 없는 날짜입니다.</p> : <p>{closeRecord.is_open ? '영업일' : '휴무일'} · 현재 <strong>{closeRecord.record_complete ? '마감 완료' : '미마감'}</strong></p>}
          <button className={`button ${closeRecord?.record_complete ? 'secondary' : 'primary'}`} disabled={!closeRecord || status === 'saving'} onClick={() => toggleClose(closeDate, !closeRecord.record_complete)}>{status === 'saving' ? '저장 중…' : closeRecord?.record_complete ? '마감 취소' : '마감 완료로 표시'}</button>
          <small className={status === 'error' ? 'negative' : 'subtle'}>{message}</small>
        </div>
      </section>
    </>
  );
}

function Metric({ index, label, value, note, accent }) {
  return <article className={`metric-card ${accent}`}><div><span>{index}.</span> {label}</div><strong>{value}</strong><p>{note}</p></article>;
}
