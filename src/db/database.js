import Dexie from 'dexie';
import { validateSeed } from '@/domain/validation';
import { assertInventoryCanDelete, assertSaleCanDelete, makeExpenseRecord, makeInventoryRecord, makeSaleRecord } from '@/domain/records';
import { validateBackupObject } from '@/domain/backup';

export const db = new Dexie('prep-cafe-operations');

db.version(1).stores({
  meta: 'key',
  suppliers: 'supplier_id,name',
  materials: 'material_id,name,supplier_id',
  menus: 'menu_id,name,category',
  recipes: '++_row_id,menu_id,material_id,recipe_version,channel_only',
  price_history: '++_row_id,material_id,effective_date',
  calendar: 'date,record_complete',
  sales: 'sale_id,date,menu_id,channel,[date+menu_id+channel]',
  opening_inventory: 'material_id,date',
  inventory_events: 'event_id,date,material_id,event_type',
  monthly_expense_plan: '++_row_id,month,category',
  expenses: 'expense_id,date,category',
  settings: 'key',
});

const tables = [
  db.meta, db.suppliers, db.materials, db.menus, db.recipes, db.price_history,
  db.calendar, db.sales, db.opening_inventory, db.inventory_events,
  db.monthly_expense_plan, db.expenses, db.settings,
];

async function replaceTables(data) {
  await Promise.all(tables.map((table) => table.clear()));
  await db.meta.put({ ...data.meta, key: 'dataset', initialized: true });
  await db.suppliers.bulkPut(data.suppliers);
  await db.materials.bulkPut(data.materials);
  await db.menus.bulkPut(data.menus);
  await db.recipes.bulkPut(data.recipes);
  await db.price_history.bulkPut(data.price_history);
  await db.calendar.bulkPut(data.calendar);
  await db.sales.bulkPut(data.sales);
  await db.opening_inventory.bulkPut(data.opening_inventory);
  await db.inventory_events.bulkPut(data.inventory_events);
  await db.monthly_expense_plan.bulkPut(data.monthly_expense_plan);
  await db.expenses.bulkPut(data.expenses);
  await db.settings.put({ ...data.settings, key: 'app' });
}

export async function initializeDatabase(rawSeed) {
  const existing = await db.meta.get('dataset');
  if (existing?.initialized) return false;
  const seed = validateSeed(rawSeed);

  await db.transaction('rw', tables, async () => {
    await replaceTables({
      ...seed,
      meta: { ...seed.meta, initialized_at: new Date().toISOString() },
    });
  });
  return true;
}

export async function readAllData() {
  const [meta, suppliers, materials, menus, recipes, priceHistory, calendar, sales, openingInventory, inventoryEvents, plans, expenses, settings] = await Promise.all([
    db.meta.get('dataset'),
    db.suppliers.toArray(),
    db.materials.toArray(),
    db.menus.toArray(),
    db.recipes.toArray(),
    db.price_history.toArray(),
    db.calendar.toArray(),
    db.sales.toArray(),
    db.opening_inventory.toArray(),
    db.inventory_events.toArray(),
    db.monthly_expense_plan.toArray(),
    db.expenses.toArray(),
    db.settings.get('app'),
  ]);
  return {
    meta,
    suppliers,
    materials,
    menus,
    recipes,
    price_history: priceHistory,
    calendar,
    sales,
    opening_inventory: openingInventory,
    inventory_events: inventoryEvents,
    monthly_expense_plan: plans,
    expenses,
    settings: settings ?? {},
  };
}

export async function setDateClosed(date, recordComplete) {
  const current = await db.calendar.get(date);
  if (!current) throw new Error('영업 달력에 없는 날짜입니다.');
  await db.transaction('rw', db.calendar, async () => {
    await db.calendar.put({ ...current, record_complete: recordComplete });
  });
}

export async function saveSale(input, editingId) {
  const data = await readAllData();
  const record = makeSaleRecord(data, input, { id: crypto.randomUUID(), editingId });
  await db.transaction('rw', db.sales, async () => { await db.sales.put(record); });
  return record;
}

export async function importSales(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('가져올 정상 행이 없습니다.');
  const data = await readAllData();
  const records = [];
  for (const input of inputs) {
    const record = makeSaleRecord(
      { ...data, sales: [...data.sales, ...records] },
      input,
      { id: crypto.randomUUID() },
    );
    records.push(record);
  }
  await db.transaction('rw', db.sales, async () => {
    await db.sales.bulkAdd(records);
  });
  return records;
}

export async function restoreBackup(input) {
  const backup = validateBackupObject(input);
  await db.transaction('rw', tables, async () => {
    await replaceTables({
      ...backup.data,
      meta: { ...backup.data.meta, restored_at: new Date().toISOString() },
    });
  });
  return backup;
}

export async function saveExpense(input, editingId) {
  const data = await readAllData();
  const record = makeExpenseRecord(data, input, { id: crypto.randomUUID(), editingId });
  await db.transaction('rw', db.expenses, async () => { await db.expenses.put(record); });
  return record;
}

export async function saveInventoryEvent(input, editingId) {
  const data = await readAllData();
  const record = makeInventoryRecord(data, input, { id: crypto.randomUUID(), editingId });
  await db.transaction('rw', db.inventory_events, async () => { await db.inventory_events.put(record); });
  return record;
}

export async function deleteRecord(kind, id) {
  const data = await readAllData();
  if (kind === 'sales') {
    const record = data.sales.find((item) => item.sale_id === id);
    if (!record) throw new Error('삭제할 판매 기록을 찾을 수 없습니다.');
    assertSaleCanDelete(data, record);
    await db.transaction('rw', db.sales, async () => { await db.sales.delete(id); });
  } else if (kind === 'expenses') {
    if (!data.expenses.some((item) => item.expense_id === id)) throw new Error('삭제할 비용 기록을 찾을 수 없습니다.');
    await db.transaction('rw', db.expenses, async () => { await db.expenses.delete(id); });
  } else if (kind === 'inventory') {
    const record = data.inventory_events.find((item) => item.event_id === id);
    if (!record) throw new Error('삭제할 재고 기록을 찾을 수 없습니다.');
    assertInventoryCanDelete(data, record);
    await db.transaction('rw', db.inventory_events, async () => { await db.inventory_events.delete(id); });
  } else {
    throw new Error('지원하지 않는 기록 종류입니다.');
  }
}
