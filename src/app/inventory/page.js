'use client';

import { useMemo, useState } from 'react';
import { useCafeData } from '@/components/DataProvider';
import { StatusView } from '@/components/StatusView';
import { number } from '@/components/Format';
import { calculateInventory } from '@/domain/calculations';

export default function InventoryPage() {
  const { data, status, message, reload } = useCafeData();
  const [filter, setFilter] = useState('전체');
  const referenceDate = useMemo(() => data ? [data.meta.as_of, ...data.sales.map((item) => item.date), ...data.inventory_events.map((item) => item.date)].sort().at(-1) : '', [data]);
  const rows = useMemo(() => data ? calculateInventory(data, referenceDate) : [], [data, referenceDate]);
  if (!data) return <StatusView status={status} message={message} onRetry={reload} />;

  const visible = rows.filter((item) => filter === '전체' || (filter === '정상' ? item.status === '정상' : filter === '소진' ? item.status === '소진' : item.status === '기록 점검 필요'));
  const counts = { normal: rows.filter((item) => item.status === '정상').length, zero: rows.filter((item) => item.status === '소진').length, negative: rows.filter((item) => item.status === '기록 점검 필요').length };

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">재료 재고 관리</p><h1>재료별 예상 잔량</h1><p className="subtle">기준일 {referenceDate} · 초기재고, 입고, 폐기, 판매 사용량과 최근 실사를 연결한 결과입니다.</p></div>
        <div className="dataset-badge"><span>관리 품목</span><strong>{rows.length}개</strong><small>g · ml · 개 단위 분리</small></div>
      </section>

      <section className="notice-card"><strong>잔량 처리 원칙</strong><p>최근 실측수량이 있으면 그 값을 새 기준으로 삼고 다음 날부터의 변동만 반영합니다. 미마감 판매도 실제 재료 사용량에 포함합니다.</p></section>

      <section className="metric-grid four">
        <Metric label="전체 관리 품목" value={`${rows.length}개`} note="기준정보 100% 연결" />
        <Metric label="정상 재고" value={`${counts.normal}개`} note="잔량이 0보다 큼" accent="green" />
        <Metric label="소진" value={`${counts.zero}개`} note="잔량 0" accent="yellow" />
        <Metric label="기록 점검 필요" value={`${counts.negative}개`} note="잔량이 음수" accent="red" />
      </section>

      <section className="section-block">
        <div className="filter-row"><div><p className="eyebrow">재료별 수불 원장</p><h2>예상 잔량 상세</h2></div><div className="segmented small">{['전체', '정상', '소진', '음수'].map((item) => <button key={item} type="button" className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
        {visible.length ? <div className="table-wrap"><table><thead><tr><th>재료</th><th>단위</th><th>공급사</th><th>초기재고</th><th>누적 입고</th><th>판매 사용</th><th>폐기</th><th>최근 실측수량</th><th>현재 예상 잔량</th><th>상태</th></tr></thead><tbody>
          {visible.map((row) => <tr key={row.material_id} className={row.status === '기록 점검 필요' ? 'danger-row' : ''}><td className="strong">{row.name}<small>{row.material_id}</small></td><td>{row.unit}</td><td>{row.supplierName}</td><td>{row.opening === null ? '기준 없음' : number(row.opening)}</td><td className="positive">+{number(row.receipts)}</td><td>-{number(row.usage)}</td><td>-{number(row.waste)}</td><td>{row.latestCount === null ? '실사 없음' : <>{number(row.latestCount)}<small>{row.latestCountDate}</small></>}</td><td className={row.balance < 0 ? 'negative strong' : 'strong'}>{row.balance === null ? '계산 불가' : `${number(row.balance)} ${row.unit}`}</td><td><span className={`tag ${row.status === '정상' ? 'ok' : row.status === '소진' ? 'warn' : 'error'}`}>{row.status}</span></td></tr>)}
        </tbody></table></div> : <div className="empty-state">선택한 상태의 재료가 없습니다.</div>}
      </section>
    </>
  );
}

function Metric({ label, value, note, accent = '' }) { return <article className={`metric-card ${accent}`}><div>{label}</div><strong>{value}</strong><p>{note}</p></article>; }
