import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertInventoryCanDelete, assertSaleCanDelete, makeExpenseRecord, makeInventoryRecord, makeSaleRecord } from '../src/domain/records.js';

const seed = JSON.parse(await readFile(new URL('../data/매장운영데이터.json', import.meta.url), 'utf8'));

test('판매 입력값에서 순매출과 당시 원가 스냅샷을 만든다', () => {
  const record = makeSaleRecord(seed, { date: '2026-09-19', menu_id: 'M01', channel: '매장', quantity: 2, unit_price: 4000, discount_amount: 500, payment_fee: 113 }, { id: 'NEW-SALE' });
  assert.equal(record.sale_id, 'NEW-SALE');
  assert.equal(record.net_sales, 7500);
  assert.ok(record.unit_food_cost_snapshot > 0);
  assert.equal(record.unit_packaging_cost_snapshot, 0);
});

test('같은 날짜·메뉴·채널 판매와 잘못된 금액을 거부한다', () => {
  const existing = seed.sales[0];
  assert.throws(() => makeSaleRecord(seed, { date: existing.date, menu_id: existing.menu_id, channel: existing.channel, quantity: 1, unit_price: 4000, discount_amount: 0, payment_fee: 0 }, { id: 'DUP' }), /같은 날짜·메뉴·채널/);
  assert.throws(() => makeExpenseRecord(seed, { date: '2026-09-19', category: '수도광열비', amount: 0, recognition: '직접 입력' }, { id: 'BAD' }), /0보다 커야/);
});

test('입고는 증가, 폐기는 감소 수량으로 저장한다', () => {
  const receipt = makeInventoryRecord(seed, { date: '2026-09-19', material_id: 'I01', event_type: '입고', quantity: 1000, supplier_id: 'V01', unit_cost: 23000, reason: '정기 입고', note: '' }, { id: 'RECEIPT' });
  const waste = makeInventoryRecord(seed, { date: '2026-09-19', material_id: 'I01', event_type: '폐기', quantity: 120, supplier_id: '', unit_cost: '', reason: '품질 저하', note: '' }, { id: 'WASTE' });
  assert.equal(receipt.quantity, 1000);
  assert.equal(waste.quantity, -120);
});

test('실사 수량은 새 기준이 되도록 차이만 한 번 저장한다', () => {
  const stocktake = makeInventoryRecord(seed, { date: '2026-09-19', material_id: 'I03', event_type: '실사조정', quantity: 2500, supplier_id: '', unit_cost: '', reason: '월말 실사', note: '' }, { id: 'COUNT' });
  assert.equal(stocktake.counted_quantity, 2500);
  assert.notEqual(stocktake.quantity, 2500);
  const withStocktake = { ...seed, inventory_events: [...seed.inventory_events, stocktake] };
  assert.throws(() => makeInventoryRecord(withStocktake, { date: '2026-09-19', material_id: 'I03', event_type: '입고', quantity: 100, supplier_id: 'V03', unit_cost: 1000, reason: '추가 입고', note: '' }, { id: 'LATE' }), /마감 실사/);
});

test('실사에 잠긴 판매·재고 기록은 수정·삭제할 수 없다', () => {
  const sale = seed.sales.find((item) => item.menu_id === 'M01' && item.channel === '매장');
  const locked = { ...seed, inventory_events: [...seed.inventory_events, { event_id: 'LOCK', date: sale.date, material_id: 'I01', event_type: '실사조정', quantity: 0, counted_quantity: 0, unit: 'g', reason: '테스트' }] };
  assert.throws(() => assertSaleCanDelete(locked, sale), /마감 실사/);
  const receipt = locked.inventory_events.find((item) => item.date === sale.date && item.material_id === 'I01' && item.event_type !== '실사조정');
  if (receipt) assert.throws(() => assertInventoryCanDelete(locked, receipt), /마감 실사/);
});
