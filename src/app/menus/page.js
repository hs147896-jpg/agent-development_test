'use client';

import { useMemo, useState } from 'react';
import { useCafeData } from '@/components/DataProvider';
import { PeriodControls } from '@/components/PeriodControls';
import { StatusView } from '@/components/StatusView';
import { number, percent, won } from '@/components/Format';
import { calculateMenuProfitability, getMenuRecipeDetail } from '@/domain/calculations';
import { getPeriodRange } from '@/domain/periods';

export default function MenusPage() {
  const { data, status, message, reload } = useCafeData();
  const [unit, setUnit] = useState('month');
  const [referenceDate, setReferenceDate] = useState('2026-09-18');
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState('margin');
  const [selectedId, setSelectedId] = useState('M01');

  const rows = useMemo(() => {
    if (!data) return [];
    const source = calculateMenuProfitability(data, unit, referenceDate).filter((item) => category === '전체' || item.category === category);
    return source.sort((a, b) => sort === 'sales' ? b.netSales - a.netSales : sort === 'quantity' ? b.quantity - a.quantity : (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
  }, [data, unit, referenceDate, category, sort]);

  if (!data) return <StatusView status={status} message={message} onRetry={reload} />;
  const allRows = calculateMenuProfitability(data, unit, referenceDate);
  const selected = rows.find((item) => item.menu_id === selectedId) ?? rows[0] ?? allRows[0];
  const recipe = getMenuRecipeDetail(data, selected.menu_id, referenceDate);
  const topMargin = [...allRows].filter((item) => item.margin !== null).sort((a, b) => b.margin - a.margin)[0];
  const topSeller = [...allRows].sort((a, b) => b.quantity - a.quantity)[0];
  const range = getPeriodRange(unit, referenceDate);

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">판매 당시 원가 기록 기반</p><h1>메뉴별 수익성 분석</h1><p className="subtle">운영비를 나누지 않은 공헌이익입니다. 매장 전체의 최종 손익과는 다릅니다.</p></div>
        <div className="dataset-badge"><span>분석 기간</span><strong>{range.start}</strong><small>~ {range.end}</small></div>
      </section>
      <section className="control-card"><PeriodControls unit={unit} onUnitChange={setUnit} referenceDate={referenceDate} onDateChange={setReferenceDate} /></section>

      <section className="metric-grid three">
        <Metric label="분석 메뉴 수" value={`${allRows.length}개`} note="전체 운영 메뉴" />
        <Metric label="최고 마진율 메뉴" value={topMargin ? percent(topMargin.margin) : '계산 불가'} note={topMargin?.name ?? '판매 자료 없음'} accent="blue" />
        <Metric label="최다 판매 메뉴" value={`${number(topSeller?.quantity ?? 0, 0)}개`} note={topSeller?.name ?? '판매 자료 없음'} accent="red" />
      </section>

      <section className="split-layout">
        <div className="section-block">
          <div className="filter-row">
            <div className="segmented small">{['전체', '음료', '디저트'].map((item) => <button key={item} type="button" className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <label>정렬<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="margin">마진율 높은 순</option><option value="sales">순매출 높은 순</option><option value="quantity">판매수량 높은 순</option></select></label>
          </div>
          {rows.length ? <div className="table-wrap"><table><thead><tr><th>선택</th><th>메뉴</th><th>분류</th><th>기준가</th><th>판매수량<br /><small>매장 / 포장</small></th><th>순매출</th><th>할인·수수료</th><th>식재료비</th><th>포장비</th><th>공헌이익</th><th>마진율</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.menu_id} className={selected.menu_id === row.menu_id ? 'selected-row' : ''} onClick={() => setSelectedId(row.menu_id)}><td><input type="radio" readOnly checked={selected.menu_id === row.menu_id} aria-label={`${row.name} 선택`} /></td><td className="strong">{row.name}</td><td>{row.category}</td><td>{won(row.price)}</td><td>{number(row.quantity, 0)}<small>{number(row.storeQty, 0)} / {number(row.takeoutQty, 0)}</small></td><td>{won(row.netSales)}</td><td>{won(row.discount + row.paymentFee)}</td><td>{won(row.food)}</td><td>{won(row.packaging)}</td><td className="positive">{won(row.contribution)}</td><td>{row.margin === null ? '판매 없음' : percent(row.margin)}</td></tr>)}
          </tbody></table></div> : <div className="empty-state">조건에 맞는 메뉴 실적 없음</div>}
        </div>

        <aside className="detail-panel">
          <p className="eyebrow">현재 조회 메뉴 · {selected.menu_id}</p>
          <h2>{selected.name}</h2>
          <div className="detail-price"><span>판매 기준가</span><strong>{won(selected.price)}</strong></div>
          <div className="margin-bar"><span style={{ width: `${Math.max(0, Math.min(100, selected.margin ?? 0))}%` }} /></div>
          <p>기간 공헌이익 <strong className="positive">{won(selected.contribution)}</strong> · 마진율 {percent(selected.margin)}</p>
          <h3>기간 판매 당시 원가 합계</h3>
          <dl className="detail-list"><div><dt>식재료비</dt><dd>{won(selected.food)}</dd></div><div><dt>포장비</dt><dd>{won(selected.packaging)}</dd></div><div><dt>결제수수료</dt><dd>{won(selected.paymentFee)}</dd></div></dl>
          <h3>기준 레시피 참고</h3>
          <p className="subtle">아래 단가는 {referenceDate} 이전 최신 가격 기준 참고값이며, 위 기간 수익성은 판매 당시 저장 원가를 사용합니다.</p>
          <div className="recipe-list">{recipe.map((item) => <div key={`${item.material_id}-${item.channel_only ?? 'all'}`}><span><b>{item.materialName}</b><small>{number(item.quantity)}{item.unit} {item.channel_only ? `· ${item.channel_only} 전용` : ''}</small></span><strong>{item.cost === null ? '가격 확인 필요' : won(item.cost)}</strong></div>)}</div>
        </aside>
      </section>
    </>
  );
}

function Metric({ label, value, note, accent = '' }) { return <article className={`metric-card ${accent}`}><div>{label}</div><strong>{value}</strong><p>{note}</p></article>; }
