'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCafeData } from '@/components/DataProvider';
import { StatusView } from '@/components/StatusView';
import { number, won } from '@/components/Format';
import { createSalesTemplateWorkbook, validateSalesImportRows, workbookRows } from '@/domain/sales-import';

const PAGE_SIZE = 20;
const tabs = [
  { id: 'sales', label: '판매' },
  { id: 'expenses', label: '비용' },
  { id: 'inventory', label: '입고·폐기·실사' },
];

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function defaultDate(data) {
  return [...data.calendar].filter((item) => item.date > data.meta.as_of && item.date <= today()).sort((a, b) => a.date.localeCompare(b.date))[0]?.date
    ?? data.meta.as_of
    ?? '';
}

function newValues(kind, data) {
  const date = defaultDate(data);
  if (kind === 'sales') return { date, menu_id: data.menus[0]?.menu_id ?? '', channel: '매장', quantity: 1, unit_price: data.menus[0]?.price ?? 0, discount_amount: 0, payment_fee: 0 };
  if (kind === 'expenses') return { date, category: '', amount: '', recognition: '직접 입력' };
  return { date, material_id: data.materials[0]?.material_id ?? '', event_type: '입고', quantity: '', supplier_id: data.materials[0]?.supplier_id ?? '', unit_cost: '', reason: '', note: '' };
}

function editValues(kind, row) {
  if (kind === 'sales') return { date: row.date, menu_id: row.menu_id, channel: row.channel, quantity: row.quantity, unit_price: row.unit_price, discount_amount: row.discount_amount, payment_fee: row.payment_fee };
  if (kind === 'expenses') return { date: row.date, category: row.category, amount: row.amount, recognition: row.recognition ?? '직접 입력' };
  return { date: row.date, material_id: row.material_id, event_type: row.event_type, quantity: row.event_type === '실사조정' ? row.counted_quantity : Math.abs(row.quantity), supplier_id: row.supplier_id ?? '', unit_cost: row.unit_cost ?? '', reason: row.reason ?? '', note: row.note ?? '' };
}

export default function RecordsPage() {
  const { data, status, message, reload, saveRecord, removeRecord, toggleClose, importSaleRecords } = useCafeData();
  const [tab, setTab] = useState('sales');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formError, setFormError] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const importFileRef = useRef(null);

  useEffect(() => { if (data && !closeDate) setCloseDate(defaultDate(data)); }, [data, closeDate]);
  useEffect(() => { setPage(1); setQuery(''); setForm(null); setDeleteTarget(null); }, [tab]);

  const rows = useMemo(() => {
    if (!data) return [];
    const source = tab === 'sales' ? data.sales : tab === 'expenses' ? data.expenses : data.inventory_events;
    const word = query.trim().toLowerCase();
    return [...source].filter((row) => {
      const labels = tab === 'sales'
        ? [row.sale_id, row.date, row.channel, data.menus.find((item) => item.menu_id === row.menu_id)?.name]
        : tab === 'expenses'
          ? [row.expense_id, row.date, row.category, row.recognition]
          : [row.event_id, row.date, row.event_type, row.reason, data.materials.find((item) => item.material_id === row.material_id)?.name];
      return !word || labels.some((value) => String(value ?? '').toLowerCase().includes(word));
    }).sort((a, b) => b.date.localeCompare(a.date) || String(b.sale_id ?? b.expense_id ?? b.event_id).localeCompare(String(a.sale_id ?? a.expense_id ?? a.event_id)));
  }, [data, tab, query]);

  if (!data) return <StatusView status={status} message={message} onRetry={reload} />;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedCalendar = data.calendar.find((item) => item.date === closeDate);

  function openNew() { setForm({ kind: tab, editingId: null, values: newValues(tab, data) }); setFormError(''); }
  function openEdit(row) { setForm({ kind: tab, editingId: row.sale_id ?? row.expense_id ?? row.event_id, values: editValues(tab, row) }); setFormError(''); }
  function update(name, value) {
    setForm((current) => {
      const values = { ...current.values, [name]: value };
      if (current.kind === 'sales' && name === 'menu_id') values.unit_price = data.menus.find((item) => item.menu_id === value)?.price ?? 0;
      if (current.kind === 'inventory' && name === 'material_id') values.supplier_id = data.materials.find((item) => item.material_id === value)?.supplier_id ?? '';
      return { ...current, values };
    });
  }
  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const result = await saveRecord(form.kind, form.values, form.editingId);
    if (result.ok) setForm(null); else setFormError(result.error);
  }
  async function confirmDelete() {
    const result = await removeRecord(tab, deleteTarget.id);
    if (result.ok) setDeleteTarget(null); else setDeleteTarget((current) => ({ ...current, error: result.error }));
  }
  async function confirmClose() {
    const result = await toggleClose(closeConfirm.date, closeConfirm.complete);
    if (result) setCloseConfirm(null);
  }

  async function downloadTemplate() {
    setImportBusy(true);
    setImportError('');
    setImportMessage('');
    try {
      const module = await import('exceljs');
      const ExcelJS = module.default ?? module;
      const workbook = createSalesTemplateWorkbook(ExcelJS, data.menus);
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '프렙-카페-판매기록-양식.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setImportMessage('판매 엑셀 양식을 내려받았습니다.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '엑셀 양식을 만들지 못했습니다.');
    } finally {
      setImportBusy(false);
    }
  }

  async function inspectWorkbook(event) {
    const file = event.target.files?.[0];
    setImportResult(null);
    setImportMessage('');
    setImportError('');
    if (!file) return;
    setImportBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('.xlsx 판매 양식 파일만 선택해 주세요.');
      if (file.size > 20 * 1024 * 1024) throw new Error('엑셀 파일은 20MB 이하만 지원합니다.');
      const module = await import('exceljs');
      const ExcelJS = module.default ?? module;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.getWorksheet('판매기록');
      if (!worksheet) throw new Error('판매기록 시트가 없습니다. 프로그램에서 받은 양식을 사용해 주세요.');
      const result = validateSalesImportRows(data, workbookRows(worksheet));
      setImportResult({ ...result, fileName: file.name });
      if (result.total === 0) setImportError('가져올 판매 기록이 없습니다.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '엑셀 파일을 읽지 못했습니다.');
    } finally {
      setImportBusy(false);
      event.target.value = '';
    }
  }

  async function importValidatedRows() {
    setImportError('');
    const result = await importSaleRecords(importResult.valid.map((item) => item.input));
    if (result.ok) {
      setImportMessage(`정상 ${result.count.toLocaleString('ko-KR')}건을 저장했습니다. 오류·중복 ${importResult.errors.length + importResult.duplicates.length}건은 저장하지 않았습니다.`);
      setImportResult(null);
    } else {
      setImportError(result.error);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">운영 기록 · 브라우저 자동 저장</p><h1>기록 관리</h1><p className="subtle">판매·비용·재고 기록을 저장하면 손익, 메뉴 수익성, 재료 잔량에 바로 반영됩니다.</p></div>
        <div className="dataset-badge"><span>현재 기록</span><strong>{number(data.sales.length + data.expenses.length + data.inventory_events.length, 0)}건</strong><small>{message}</small></div>
      </section>

      <section className="record-toolbar">
        <div className="segmented">{tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        <label className="search-box"><span>검색</span><input aria-label="기록 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="날짜, 메뉴·재료·비용명" /></label>
        <button className="button primary" type="button" onClick={openNew}>+ {tabs.find((item) => item.id === tab).label} 기록</button>
      </section>

      <section className="import-panel">
        <div className="import-panel-heading">
          <div><p className="eyebrow">EPIC 3 · 파일은 서버로 전송되지 않음</p><h2>판매 엑셀 가져오기</h2><p className="subtle">전용 양식의 판매기록 시트를 검사한 뒤 정상 행만 한 번에 저장합니다.</p></div>
          <div className="import-actions">
            <button className="button secondary" type="button" disabled={importBusy} onClick={downloadTemplate}>판매 양식 다운로드</button>
            <input ref={importFileRef} className="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={inspectWorkbook} />
            <button className="button primary" type="button" disabled={importBusy} onClick={() => importFileRef.current?.click()}>{importBusy ? '파일 검사 중…' : '엑셀 가져오기'}</button>
          </div>
        </div>
        {importResult && <ImportResult result={importResult} onImport={importValidatedRows} disabled={status === 'saving'} />}
        {importMessage && <p className="form-success" role="status">{importMessage}</p>}
        {importError && <p className="form-error" role="alert">{importError}</p>}
      </section>

      <section className="records-layout">
        <div className="section-block">
          <div className="section-title"><h2>{tabs.find((item) => item.id === tab).label} 기록</h2><span>검색 결과 {number(rows.length, 0)}건 · {page}/{pageCount}쪽</span></div>
          {visible.length ? <RecordsTable kind={tab} rows={visible} data={data} onEdit={openEdit} onDelete={(row) => setDeleteTarget({ id: row.sale_id ?? row.expense_id ?? row.event_id, label: describeRow(tab, row, data) })} /> : <div className="empty-state">조건에 맞는 기록이 없습니다.</div>}
          <div className="pagination"><button className="button secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page} / {pageCount}</span><button className="button secondary" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>다음</button></div>
        </div>

        <aside className="close-manager">
          <div className="section-title"><h2>영업일 마감</h2></div>
          <label>확인할 날짜<input type="date" value={closeDate} min={data.calendar[0]?.date} max={today()} onChange={(event) => setCloseDate(event.target.value)} /></label>
          {selectedCalendar ? <><p><span className={`tag ${selectedCalendar.record_complete ? 'ok' : 'warn'}`}>{selectedCalendar.record_complete ? '마감 완료' : '미마감'}</span></p><p className="subtle">마감된 날짜만 실제 손익에 포함됩니다.</p><button className={`button ${selectedCalendar.record_complete ? 'secondary' : 'primary'}`} type="button" disabled={status === 'saving'} onClick={() => setCloseConfirm({ date: closeDate, complete: !selectedCalendar.record_complete })}>{selectedCalendar.record_complete ? '마감 취소' : '마감 완료'}</button></> : <p className="form-error">영업 달력에 없는 날짜입니다.</p>}
        </aside>
      </section>

      {form && <RecordModal form={form} data={data} status={status} error={formError} onChange={update} onSubmit={submit} onClose={() => setForm(null)} />}
      {deleteTarget && <ConfirmModal title="기록을 삭제할까요?" text={`${deleteTarget.label}의 계산 영향도 함께 제거됩니다.`} error={deleteTarget.error} confirmLabel="삭제" danger onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
      {closeConfirm && <ConfirmModal title={closeConfirm.complete ? '영업일을 마감할까요?' : '마감을 취소할까요?'} text={`${closeConfirm.date}의 실제 손익 포함 상태가 바뀝니다.`} confirmLabel={closeConfirm.complete ? '마감 완료' : '마감 취소'} onCancel={() => setCloseConfirm(null)} onConfirm={confirmClose} />}
    </>
  );
}

function RecordsTable({ kind, rows, data, onEdit, onDelete }) {
  return <div className="table-wrap records-table"><table><thead>{kind === 'sales' ? <tr><th>날짜</th><th>메뉴</th><th>채널</th><th>수량</th><th>순매출</th><th>수수료</th><th>관리</th></tr> : kind === 'expenses' ? <tr><th>날짜</th><th>비용 항목</th><th>금액</th><th>인식 기준</th><th>관리</th></tr> : <tr><th>날짜</th><th>유형</th><th>재료</th><th>수량</th><th>사유</th><th>관리</th></tr>}</thead><tbody>{rows.map((row) => {
    const id = row.sale_id ?? row.expense_id ?? row.event_id;
    return <tr key={id}>{kind === 'sales' ? <><td>{row.date}<small>{id}</small></td><td className="strong">{data.menus.find((item) => item.menu_id === row.menu_id)?.name ?? row.menu_id}</td><td>{row.channel}</td><td>{number(row.quantity, 0)}개</td><td>{won(row.net_sales)}</td><td>{won(row.payment_fee)}</td></> : kind === 'expenses' ? <><td>{row.date}<small>{id}</small></td><td className="strong">{row.category}</td><td>{won(row.amount)}</td><td>{row.recognition ?? '직접 입력'}</td></> : <><td>{row.date}<small>{id}</small></td><td><span className={`tag ${row.event_type === '폐기' ? 'error' : row.event_type === '실사조정' ? 'warn' : 'ok'}`}>{row.event_type}</span></td><td className="strong">{data.materials.find((item) => item.material_id === row.material_id)?.name ?? row.material_id}</td><td>{row.event_type === '실사조정' ? `실제 ${number(row.counted_quantity)}${row.unit}` : `${row.quantity > 0 ? '+' : ''}${number(row.quantity)}${row.unit}`}</td><td>{row.reason}</td></>}<td><div className="row-actions"><button type="button" onClick={() => onEdit(row)}>수정</button><button className="danger" type="button" onClick={() => onDelete(row)}>삭제</button></div></td></tr>;
  })}</tbody></table></div>;
}

function RecordModal({ form, data, status, error, onChange, onSubmit, onClose }) {
  const value = form.values;
  const material = data.materials.find((item) => item.material_id === value.material_id);
  const title = `${form.editingId ? '수정' : '새로 입력'} · ${tabs.find((item) => item.id === form.kind).label}`;
  return <div className="modal-backdrop" role="presentation"><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title"><div className="modal-heading"><div><p className="eyebrow">저장 즉시 관련 계산 갱신</p><h2 id="record-modal-title">{title}</h2></div><button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>×</button></div><form onSubmit={onSubmit}>
    <div className="form-grid"><Field label="날짜"><input type="date" value={value.date} max={today()} onChange={(event) => onChange('date', event.target.value)} required /></Field>
    {form.kind === 'sales' && <><Field label="메뉴"><select value={value.menu_id} onChange={(event) => onChange('menu_id', event.target.value)}>{data.menus.map((item) => <option key={item.menu_id} value={item.menu_id}>{item.name}</option>)}</select></Field><Field label="판매 채널"><select value={value.channel} onChange={(event) => onChange('channel', event.target.value)}><option>매장</option><option>포장</option></select></Field><NumberField label="판매 수량" value={value.quantity} min="1" onChange={(v) => onChange('quantity', v)} /><NumberField label="판매 단가(원)" value={value.unit_price} min="0" onChange={(v) => onChange('unit_price', v)} /><NumberField label="할인 금액(원)" value={value.discount_amount} min="0" onChange={(v) => onChange('discount_amount', v)} /><NumberField label="결제 수수료(원)" value={value.payment_fee} min="0" onChange={(v) => onChange('payment_fee', v)} /></>}
    {form.kind === 'expenses' && <><Field label="비용 항목"><input value={value.category} onChange={(event) => onChange('category', event.target.value)} placeholder="예: 수도광열비" required /></Field><NumberField label="비용 금액(원)" value={value.amount} min="1" onChange={(v) => onChange('amount', v)} /><Field label="인식 기준"><input value={value.recognition} onChange={(event) => onChange('recognition', event.target.value)} /></Field></>}
    {form.kind === 'inventory' && <><Field label="기록 유형"><select value={value.event_type} onChange={(event) => onChange('event_type', event.target.value)}><option>입고</option><option>폐기</option><option>실사조정</option></select></Field><Field label="재료"><select value={value.material_id} onChange={(event) => onChange('material_id', event.target.value)}>{data.materials.map((item) => <option key={item.material_id} value={item.material_id}>{item.name}</option>)}</select></Field><NumberField label={`${value.event_type === '실사조정' ? '실제 확인 수량' : `${value.event_type} 수량`} (${material?.unit ?? ''})`} value={value.quantity} min={value.event_type === '실사조정' ? '0' : '0.1'} step="any" onChange={(v) => onChange('quantity', v)} />{value.event_type === '입고' && <><Field label="공급사"><select value={value.supplier_id} onChange={(event) => onChange('supplier_id', event.target.value)}>{data.suppliers.map((item) => <option key={item.supplier_id} value={item.supplier_id}>{item.name}</option>)}</select></Field><NumberField label="단가(원, 선택)" value={value.unit_cost} min="0" required={false} onChange={(v) => onChange('unit_cost', v)} /></>}<Field label="사유"><input value={value.reason} onChange={(event) => onChange('reason', event.target.value)} placeholder={value.event_type === '실사조정' ? '예: 월말 실사' : '예: 정기 입고'} required /></Field>{value.event_type === '실사조정' && <Field label="메모(선택)"><input value={value.note} onChange={(event) => onChange('note', event.target.value)} /></Field>}</>}
    </div>{form.kind === 'inventory' && value.event_type === '폐기' && <p className="form-note">폐기 수량은 양수로 입력하며, 저장할 때 재고에서 차감됩니다.</p>}{form.kind === 'inventory' && value.event_type === '실사조정' && <p className="form-note">입력한 실제 수량이 이 날짜의 새 재고 기준이 됩니다.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>취소</button><button className="button primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '저장 중…' : '저장'}</button></div></form></section></div>;
}

function Field({ label, children }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function NumberField({ label, value, onChange, min, step = '1', required = true }) { return <Field label={label}><input type="number" value={value} min={min} step={step} onChange={(event) => onChange(event.target.value)} required={required} /></Field>; }
function ConfirmModal({ title, text, error, confirmLabel, danger = false, onCancel, onConfirm }) { return <div className="modal-backdrop"><section className="confirm-modal" role="alertdialog" aria-modal="true"><h2>{title}</h2><p className="subtle">{text}</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="button secondary" type="button" onClick={onCancel}>취소</button><button className={`button ${danger ? 'danger-button' : 'primary'}`} type="button" onClick={onConfirm}>{confirmLabel}</button></div></section></div>; }
function describeRow(kind, row, data) { if (kind === 'sales') return `${row.date} ${data.menus.find((item) => item.menu_id === row.menu_id)?.name ?? row.menu_id} ${row.channel}`; if (kind === 'expenses') return `${row.date} ${row.category}`; return `${row.date} ${data.materials.find((item) => item.material_id === row.material_id)?.name ?? row.material_id} ${row.event_type}`; }

function ImportResult({ result, onImport, disabled }) {
  const problems = [...result.errors.map((item) => ({ ...item, type: '오류' })), ...result.duplicates.map((item) => ({ ...item, type: '중복' }))];
  return <div className="import-result">
    <div className="import-stats">
      <div><span>파일</span><strong>{result.fileName}</strong></div>
      <div><span>전체</span><strong>{result.total.toLocaleString('ko-KR')}행</strong></div>
      <div className="positive"><span>정상</span><strong>{result.valid.length.toLocaleString('ko-KR')}행</strong></div>
      <div className="negative"><span>오류</span><strong>{result.errors.length.toLocaleString('ko-KR')}행</strong></div>
      <div className="warning-color"><span>중복</span><strong>{result.duplicates.length.toLocaleString('ko-KR')}행</strong></div>
    </div>
    {problems.length > 0 && <div className="table-wrap import-problems"><table><thead><tr><th>행</th><th>구분</th><th>문제 값</th><th>제외 이유</th></tr></thead><tbody>{problems.slice(0, 100).map((item) => <tr key={`${item.type}-${item.rowNumber}`}><td>{item.rowNumber}</td><td><span className={`tag ${item.type === '오류' ? 'error' : 'warn'}`}>{item.type}</span></td><td>{item.input.date || '-'} · {item.input.menu_id || '-'} · {item.input.channel || '-'}</td><td>{item.reason}</td></tr>)}</tbody></table>{problems.length > 100 && <p className="subtle">첫 100건만 표시합니다.</p>}</div>}
    <div className="import-result-actions"><p className="subtle">오류와 중복은 저장하지 않으며, 정상 행은 모두 성공해야만 반영됩니다.</p><button className="button primary" type="button" disabled={disabled || result.valid.length === 0} onClick={onImport}>정상 {result.valid.length.toLocaleString('ko-KR')}건만 가져오기</button></div>
  </div>;
}
