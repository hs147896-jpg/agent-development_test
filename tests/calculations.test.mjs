import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateInventory, calculateMenuProfitability, calculatePerformance } from '../src/domain/calculations.js';
import { getPeriodRange } from '../src/domain/periods.js';
import { validateSeed } from '../src/domain/validation.js';

const seed = JSON.parse(await readFile(new URL('../data/매장운영데이터.json', import.meta.url), 'utf8'));

test('초기 JSON의 필수 묶음과 연결 정보를 검사한다', () => {
  const validated = validateSeed(seed);
  assert.equal(validated.sales.length, 6112);
  assert.equal(validated.materials.length, 11);
  assert.equal(validated.menus.length, 8);
});

test('주간·분기·반기 경계를 달력 기준으로 계산한다', () => {
  assert.deepEqual(getPeriodRange('week', '2026-09-18'), { start: '2026-09-14', end: '2026-09-20' });
  assert.deepEqual(getPeriodRange('quarter', '2026-09-18'), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(getPeriodRange('half', '2026-09-18'), { start: '2026-07-01', end: '2026-12-31' });
});

test('실제 손익은 마감된 날짜만 사용하고 수식을 정확히 맞춘다', () => {
  const result = calculatePerformance(seed, 'month', '2026-09-18');
  assert.equal(result.closedCount, 18);
  assert.equal(result.unclosed.length, 12);
  assert.equal(result.direct, result.food + result.packaging + result.paymentFee);
  assert.equal(result.operatingProfit, result.netSales - result.direct - result.operatingExpenses);
  assert.equal(result.channels.reduce((sum, item) => sum + item.netSales, 0), result.netSales);
});

test('메뉴별 합계는 같은 기간 전체 실적과 일치한다', () => {
  const performance = calculatePerformance(seed, 'month', '2026-09-18');
  const menus = calculateMenuProfitability(seed, 'month', '2026-09-18');
  assert.equal(menus.length, 8);
  assert.equal(menus.reduce((sum, item) => sum + item.netSales, 0), performance.netSales);
  assert.equal(menus.reduce((sum, item) => sum + item.contribution, 0), performance.contribution);
});

test('재고는 11개 재료를 계산하고 상태를 빠짐없이 분류한다', () => {
  const rows = calculateInventory(seed, seed.meta.as_of);
  assert.equal(rows.length, 11);
  assert.equal(rows.some((item) => item.balance === null), false);
  assert.equal(rows.every((item) => ['정상', '소진', '기록 점검 필요'].includes(item.status)), true);
  const packaging = rows.find((item) => item.material_id === 'I10');
  assert.ok(packaging.usage > 0, '포장 판매 재료 사용량이 반영되어야 한다.');
});

test('중복 판매 ID가 있는 초기 자료는 거부한다', () => {
  const invalid = structuredClone(seed);
  invalid.sales[1].sale_id = invalid.sales[0].sale_id;
  assert.throws(() => validateSeed(invalid), /판매 ID 중복/);
});
