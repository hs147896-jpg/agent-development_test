import { z } from 'zod';

const id = z.string().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finiteNumber = z.number().finite();

const seedSchema = z.object({
  meta: z.object({
    dataset_id: id,
    version: id,
    store_name: id,
    start_date: date,
    as_of: date,
    currency: id,
  }).passthrough(),
  suppliers: z.array(z.object({ supplier_id: id, name: id }).passthrough()),
  materials: z.array(z.object({ material_id: id, name: id, unit: id, supplier_id: id }).passthrough()),
  menus: z.array(z.object({ menu_id: id, name: id, price: finiteNumber, category: id, recipe_version: id }).passthrough()),
  recipes: z.array(z.object({ recipe_version: id, menu_id: id, material_id: id, quantity: finiteNumber, unit: id, channel_only: z.string().optional() }).passthrough()),
  price_history: z.array(z.object({ material_id: id, effective_date: date, pack_price: finiteNumber, pack_quantity: finiteNumber.positive() }).passthrough()),
  calendar: z.array(z.object({ date, is_open: z.boolean(), record_complete: z.boolean() }).passthrough()),
  sales: z.array(z.object({ sale_id: id, date, menu_id: id, channel: id, quantity: finiteNumber.nonnegative(), net_sales: finiteNumber, payment_fee: finiteNumber, unit_food_cost_snapshot: finiteNumber, unit_packaging_cost_snapshot: finiteNumber }).passthrough()),
  opening_inventory: z.array(z.object({ material_id: id, date, quantity: finiteNumber, unit: id }).passthrough()),
  inventory_events: z.array(z.object({ event_id: id, date, material_id: id, event_type: id, quantity: finiteNumber, unit: id, counted_quantity: finiteNumber.optional() }).passthrough()),
  expenses: z.array(z.object({ expense_id: id, date, category: id, amount: finiteNumber }).passthrough()),
  monthly_expense_plan: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), category: id, amount: finiteNumber }).passthrough()),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

function duplicateValues(items, key) {
  const seen = new Set();
  const duplicates = new Set();
  items.forEach((item) => {
    const value = item[key];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

export function validateSeed(input) {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`초기 자료 형식 오류: ${first.path.join('.')} ${first.message}`);
  }

  const data = parsed.data;
  const uniqueChecks = [
    ['판매', data.sales, 'sale_id'],
    ['비용', data.expenses, 'expense_id'],
    ['재고', data.inventory_events, 'event_id'],
    ['메뉴', data.menus, 'menu_id'],
    ['재료', data.materials, 'material_id'],
    ['공급사', data.suppliers, 'supplier_id'],
  ];
  for (const [label, rows, key] of uniqueChecks) {
    const duplicates = duplicateValues(rows, key);
    if (duplicates.length) throw new Error(`${label} ID 중복: ${duplicates.slice(0, 3).join(', ')}`);
  }

  const menuIds = new Set(data.menus.map((item) => item.menu_id));
  const materialIds = new Set(data.materials.map((item) => item.material_id));
  const supplierIds = new Set(data.suppliers.map((item) => item.supplier_id));
  if (data.sales.some((item) => !menuIds.has(item.menu_id))) throw new Error('판매 기록에 알 수 없는 메뉴가 있습니다.');
  if (data.recipes.some((item) => !menuIds.has(item.menu_id) || !materialIds.has(item.material_id))) throw new Error('레시피 연결 정보를 확인해 주세요.');
  if (data.inventory_events.some((item) => !materialIds.has(item.material_id))) throw new Error('재고 기록에 알 수 없는 재료가 있습니다.');
  if (data.materials.some((item) => !supplierIds.has(item.supplier_id))) throw new Error('재료의 공급사 연결 정보를 확인해 주세요.');
  return data;
}
