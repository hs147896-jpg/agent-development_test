import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { backupCounts, createBackupObject, parseBackupText, validateBackupObject } from '../src/domain/backup.js';
import { createSalesTemplateWorkbook, SALES_IMPORT_HEADERS, validateSalesImportRows, workbookRows } from '../src/domain/sales-import.js';

const seed = JSON.parse(await readFile(new URL('../data/매장운영데이터.json', import.meta.url), 'utf8'));

test('판매 엑셀 양식에 정해진 시트와 열을 만든다', async () => {
  const workbook = createSalesTemplateWorkbook(ExcelJS, seed.menus);
  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  const sheet = reopened.getWorksheet('판매기록');
  assert.ok(sheet);
  assert.ok(reopened.getWorksheet('작성안내'));
  assert.deepEqual(SALES_IMPORT_HEADERS.map((_, index) => sheet.getCell(1, index + 1).value), SALES_IMPORT_HEADERS);
  assert.deepEqual(workbookRows(sheet), []);
});

test('엑셀 행의 정상·오류·기존 중복·파일 내 중복을 구분한다', () => {
  const existing = seed.sales[0];
  const validValues = {
    '판매일': '2026-09-19', '메뉴 ID': 'M02', '판매채널': '매장', '판매수량': 2,
    '판매당시단가': 4500, '할인금액': 0, '결제수수료': 100,
  };
  const result = validateSalesImportRows(seed, [
    { rowNumber: 2, values: validValues },
    { rowNumber: 3, values: validValues },
    { rowNumber: 4, values: { ...validValues, '메뉴 ID': 'UNKNOWN' } },
    { rowNumber: 5, values: { ...validValues, '판매일': existing.date, '메뉴 ID': existing.menu_id, '판매채널': existing.channel } },
  ]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.total, 4);
});

test('사용자 확인용 엑셀 파일의 정상·오류·중복 건수가 예상과 같다', async () => {
  const validWorkbook = new ExcelJS.Workbook();
  await validWorkbook.xlsx.load(await readFile(new URL('./fixtures/epic3-sales-valid.xlsx', import.meta.url)));
  const validResult = validateSalesImportRows(seed, workbookRows(validWorkbook.getWorksheet('판매기록')));
  assert.deepEqual([validResult.valid.length, validResult.errors.length, validResult.duplicates.length], [1, 0, 0]);

  const mixedWorkbook = new ExcelJS.Workbook();
  await mixedWorkbook.xlsx.load(await readFile(new URL('./fixtures/epic3-sales-mixed.xlsx', import.meta.url)));
  const mixedResult = validateSalesImportRows(seed, workbookRows(mixedWorkbook.getWorksheet('판매기록')));
  assert.deepEqual([mixedResult.valid.length, mixedResult.errors.length, mixedResult.duplicates.length], [1, 1, 1]);
});

test('전체 JSON 백업을 왕복 검사하고 손상·이전 버전을 거부한다', () => {
  const backup = createBackupObject(seed, { createdAt: '2026-10-12T01:02:03.000Z', appVersion: '0.1.0' });
  const restored = parseBackupText(JSON.stringify(backup));
  assert.deepEqual(restored.counts, backupCounts(seed));
  assert.equal(restored.data.sales.length, seed.sales.length);
  assert.equal(restored.data.meta.as_of, seed.meta.as_of);

  const wrongCount = structuredClone(backup);
  wrongCount.counts.sales += 1;
  assert.throws(() => validateBackupObject(wrongCount), /건수/);

  const oldVersion = structuredClone(backup);
  oldVersion.schemaVersion = 0;
  assert.throws(() => validateBackupObject(oldVersion), /지원하지 않는 백업 버전/);
  assert.throws(() => parseBackupText('{broken'), /손상/);
});
