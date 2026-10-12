import { writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import seed from '../../src/data/seed.json' with { type: 'json' };
import { createSalesTemplateWorkbook } from '../../src/domain/sales-import.js';

async function save(name, rows) {
  const workbook = createSalesTemplateWorkbook(ExcelJS, seed.menus);
  const worksheet = workbook.getWorksheet('판매기록');
  rows.forEach((values, index) => {
    worksheet.getRow(index + 2).values = values;
  });
  await writeFile(new URL(name, import.meta.url), Buffer.from(await workbook.xlsx.writeBuffer()));
}

await save('epic3-sales-valid.xlsx', [
  ['2026-09-20', 'M03', '매장', 2, 4800, 0, 144],
]);

await save('epic3-sales-mixed.xlsx', [
  ['2026-09-20', 'M04', '포장', 1, 5300, 300, 75],
  ['2026-09-20', 'UNKNOWN', '매장', 1, 4000, 0, 60],
  ['2025-07-01', 'M01', '매장', 1, 4000, 0, 60],
]);
