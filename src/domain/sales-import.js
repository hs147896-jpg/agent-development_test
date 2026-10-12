import { makeSaleRecord } from './records.js';

export const SALES_IMPORT_HEADERS = [
  '판매일',
  '메뉴 ID',
  '판매채널',
  '판매수량',
  '판매당시단가',
  '할인금액',
  '결제수수료',
];

function pad(value) {
  return String(value).padStart(2, '0');
}

export function normalizeExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.round(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

export function normalizeSalesImportRow(row) {
  return {
    date: normalizeExcelDate(row['판매일']),
    menu_id: String(row['메뉴 ID'] ?? '').trim(),
    channel: String(row['판매채널'] ?? '').trim(),
    quantity: row['판매수량'],
    unit_price: row['판매당시단가'],
    discount_amount: row['할인금액'],
    payment_fee: row['결제수수료'],
  };
}

export function validateSalesImportRows(data, rows) {
  const valid = [];
  const errors = [];
  const duplicates = [];
  const stagedSales = [...data.sales];

  for (const row of rows) {
    const input = normalizeSalesImportRow(row.values ?? row);
    try {
      const record = makeSaleRecord(
        { ...data, sales: stagedSales },
        input,
        { id: `IMPORT-${row.rowNumber ?? valid.length + errors.length + duplicates.length + 2}` },
      );
      stagedSales.push(record);
      valid.push({ rowNumber: row.rowNumber, input, record });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '행을 확인해 주세요.';
      const detail = { rowNumber: row.rowNumber, input, reason };
      if (reason.includes('같은 날짜·메뉴·채널')) duplicates.push(detail);
      else errors.push(detail);
    }
  }

  return { total: rows.length, valid, errors, duplicates };
}

export function assertSalesImportHeaders(headers) {
  const normalized = headers.map((value) => String(value ?? '').trim());
  const matches = SALES_IMPORT_HEADERS.length === normalized.length
    && SALES_IMPORT_HEADERS.every((header, index) => normalized[index] === header);
  if (!matches) {
    throw new Error(`지원하지 않는 양식입니다. 첫 행을 ${SALES_IMPORT_HEADERS.join(', ')} 순서로 맞춰 주세요.`);
  }
}

export function workbookRows(worksheet) {
  const headers = SALES_IMPORT_HEADERS.map((_, index) => worksheet.getCell(1, index + 1).value);
  assertSalesImportHeaders(headers);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = {};
    let hasValue = false;
    SALES_IMPORT_HEADERS.forEach((header, index) => {
      const value = worksheet.getCell(rowNumber, index + 1).value;
      values[header] = value;
      if (value !== null && value !== undefined && String(value).trim() !== '') hasValue = true;
    });
    if (hasValue) rows.push({ rowNumber, values });
  }
  if (rows.length > 10_000) throw new Error('한 번에 가져올 수 있는 판매 기록은 10,000행까지입니다.');
  return rows;
}

export function createSalesTemplateWorkbook(ExcelJS, menus) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '프렙 카페 운영';
  workbook.created = new Date();
  const sales = workbook.addWorksheet('판매기록', { views: [{ state: 'frozen', ySplit: 1 }] });
  sales.columns = [
    { header: SALES_IMPORT_HEADERS[0], key: 'date', width: 14 },
    { header: SALES_IMPORT_HEADERS[1], key: 'menu_id', width: 14 },
    { header: SALES_IMPORT_HEADERS[2], key: 'channel', width: 14 },
    { header: SALES_IMPORT_HEADERS[3], key: 'quantity', width: 14 },
    { header: SALES_IMPORT_HEADERS[4], key: 'unit_price', width: 18 },
    { header: SALES_IMPORT_HEADERS[5], key: 'discount', width: 14 },
    { header: SALES_IMPORT_HEADERS[6], key: 'fee', width: 16 },
  ];
  sales.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sales.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  for (let row = 2; row <= 201; row += 1) {
    sales.getCell(row, 1).numFmt = 'yyyy-mm-dd';
    sales.getCell(row, 3).dataValidation = { type: 'list', allowBlank: false, formulae: ['"\uB9E4\uC7A5,\uD3EC\uC7A5"'] };
  }

  const guide = workbook.addWorksheet('작성안내');
  guide.columns = [{ width: 22 }, { width: 64 }];
  [
    ['항목', '안내'],
    ['판매일', 'YYYY-MM-DD 형식의 영업일'],
    ['판매채널', '매장 또는 포장'],
    ['중복 기준', '판매일 + 메뉴 ID + 판매채널이 같으면 가져오지 않음'],
    ['금액', '할인금액과 결제수수료는 0 이상, 할인금액은 판매총액 이하'],
  ].forEach((values) => guide.addRow(values));
  guide.addRow([]);
  guide.addRow(['메뉴 ID', '메뉴명']);
  menus.forEach((menu) => guide.addRow([menu.menu_id, menu.name]));
  guide.getRow(1).font = { bold: true };
  guide.getRow(7).font = { bold: true };
  return workbook;
}
