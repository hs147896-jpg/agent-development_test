import Decimal from 'decimal.js';
import { z } from 'zod';
import { calculateInventory } from './calculations.js';

const requiredNumber = (schema) => z.preprocess(
  (value) => value === '' || value === null || value === undefined ? undefined : value,
  schema,
);

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 선택해 주세요.');

const saleSchema = z.object({
  date: dateField,
  menu_id: z.string().min(1, '메뉴를 선택해 주세요.'),
  channel: z.enum(['매장', '포장'], { message: '판매채널을 선택해 주세요.' }),
  quantity: requiredNumber(z.coerce.number().finite().int('판매수량은 정수로 입력해 주세요.').positive('판매수량은 0보다 커야 합니다.')),
  unit_price: requiredNumber(z.coerce.number().finite().nonnegative('판매단가는 0 이상이어야 합니다.')),
  discount_amount: requiredNumber(z.coerce.number().finite().nonnegative('할인금액은 0 이상이어야 합니다.')),
  payment_fee: requiredNumber(z.coerce.number().finite().nonnegative('결제수수료는 0 이상이어야 합니다.')),
});

const expenseSchema = z.object({
  date: dateField,
  category: z.string().trim().min(1, '비용항목을 입력해 주세요.'),
  amount: requiredNumber(z.coerce.number().finite().positive('비용 금액은 0보다 커야 합니다.')),
  recognition: z.string().trim().optional().default('직접 입력'),
});

const inventorySchema = z.object({
  date: dateField,
  material_id: z.string().min(1, '재료를 선택해 주세요.'),
  event_type: z.enum(['입고', '폐기', '실사조정'], { message: '재고 유형을 선택해 주세요.' }),
  quantity: requiredNumber(z.coerce.number().finite().nonnegative('수량은 0 이상이어야 합니다.')),
  supplier_id: z.string().optional().default(''),
  unit_cost: z.preprocess((value) => value === '' || value === null || value === undefined ? undefined : value, z.coerce.number().finite().nonnegative().optional()),
  reason: z.string().trim().min(1, '사유를 입력해 주세요.'),
  note: z.string().trim().optional().default(''),
});

function firstIssue(result) {
  return result.error.issues[0]?.message ?? '입력값을 확인해 주세요.';
}

function ensureKnownDate(data, date) {
  if (!data.calendar.some((item) => item.date === date)) throw new Error('영업 달력에 없는 날짜입니다.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (date > today) throw new Error('오늘보다 미래인 날짜에는 기록할 수 없습니다.');
}

function relatedRecipeMaterials(data, menuId, recipeVersion, channel) {
  return data.recipes.filter((item) => item.menu_id === menuId && item.recipe_version === recipeVersion && (!item.channel_only || item.channel_only === channel));
}

function hasClosingStocktake(data, date, materialIds, ignoreEventId) {
  return data.inventory_events.some((item) => item.event_id !== ignoreEventId && item.date === date && materialIds.includes(item.material_id) && item.event_type === '실사조정');
}

export function makeSaleRecord(data, rawInput, { id, editingId } = {}) {
  const parsed = saleSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(firstIssue(parsed));
  const input = parsed.data;
  ensureKnownDate(data, input.date);
  const menu = data.menus.find((item) => item.menu_id === input.menu_id);
  if (!menu) throw new Error('선택한 메뉴를 찾을 수 없습니다.');
  if (input.discount_amount > input.quantity * input.unit_price) throw new Error('할인금액이 판매총액보다 클 수 없습니다.');
  const duplicate = data.sales.find((item) => item.sale_id !== editingId && item.date === input.date && item.menu_id === input.menu_id && item.channel === input.channel);
  if (duplicate) throw new Error(`같은 날짜·메뉴·채널의 판매가 있습니다. ${duplicate.sale_id} 기록을 수정해 주세요.`);

  const recipe = relatedRecipeMaterials(data, menu.menu_id, menu.recipe_version, input.channel);
  if (!recipe.length) throw new Error('판매일에 사용할 레시피를 찾을 수 없습니다.');
  if (hasClosingStocktake(data, input.date, recipe.map((item) => item.material_id))) throw new Error('해당 날짜에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');
  if (editingId) {
    const previous = data.sales.find((item) => item.sale_id === editingId);
    if (!previous) throw new Error('수정할 판매 기록을 찾을 수 없습니다.');
    const previousMaterials = relatedRecipeMaterials(data, previous.menu_id, previous.recipe_version, previous.channel).map((item) => item.material_id);
    if (hasClosingStocktake(data, previous.date, previousMaterials)) throw new Error('기존 판매일에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');
  }

  let food = new Decimal(0);
  let packaging = new Decimal(0);
  for (const item of recipe) {
    const material = data.materials.find((row) => row.material_id === item.material_id);
    if (!material || material.unit !== item.unit) throw new Error(`${material?.name ?? item.material_id}의 레시피 단위를 확인해 주세요.`);
    const price = data.price_history.filter((row) => row.material_id === item.material_id && row.effective_date <= input.date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    if (!price) throw new Error(`${material.name}의 ${input.date} 이전 가격이 없습니다.`);
    const lineCost = new Decimal(price.pack_price).div(price.pack_quantity).times(item.quantity);
    if (item.channel_only) packaging = packaging.plus(lineCost);
    else food = food.plus(lineCost);
  }

  return {
    sale_id: editingId ?? id,
    ...input,
    net_sales: new Decimal(input.quantity).times(input.unit_price).minus(input.discount_amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    recipe_version: menu.recipe_version,
    unit_food_cost_snapshot: food.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber(),
    unit_packaging_cost_snapshot: packaging.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber(),
  };
}

export function makeExpenseRecord(data, rawInput, { id, editingId } = {}) {
  const parsed = expenseSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(firstIssue(parsed));
  ensureKnownDate(data, parsed.data.date);
  if (editingId && !data.expenses.some((item) => item.expense_id === editingId)) throw new Error('수정할 비용 기록을 찾을 수 없습니다.');
  return { expense_id: editingId ?? id, ...parsed.data, recognition: parsed.data.recognition || '직접 입력' };
}

export function makeInventoryRecord(data, rawInput, { id, editingId } = {}) {
  const parsed = inventorySchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(firstIssue(parsed));
  const input = parsed.data;
  ensureKnownDate(data, input.date);
  const material = data.materials.find((item) => item.material_id === input.material_id);
  if (!material) throw new Error('선택한 재료를 찾을 수 없습니다.');
  if (editingId) {
    const previous = data.inventory_events.find((item) => item.event_id === editingId);
    if (!previous) throw new Error('수정할 재고 기록을 찾을 수 없습니다.');
    if (previous.event_type !== '실사조정' && hasClosingStocktake(data, previous.date, [previous.material_id], previous.event_id)) throw new Error('기존 기록 날짜에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');
  }
  if ((input.event_type === '입고' || input.event_type === '폐기') && input.quantity <= 0) throw new Error(`${input.event_type} 수량은 0보다 커야 합니다.`);
  if (input.event_type === '입고' && !data.suppliers.some((item) => item.supplier_id === input.supplier_id)) throw new Error('입고 공급사를 선택해 주세요.');
  if (input.event_type === '실사조정' && hasClosingStocktake(data, input.date, [input.material_id], editingId)) throw new Error('같은 날짜와 재료의 실사 기록이 이미 있습니다.');
  if (input.event_type !== '실사조정' && hasClosingStocktake(data, input.date, [input.material_id], editingId)) throw new Error('해당 날짜에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');

  if (input.event_type === '실사조정') {
    const dataWithoutEditing = editingId ? { ...data, inventory_events: data.inventory_events.filter((item) => item.event_id !== editingId) } : data;
    const expected = calculateInventory(dataWithoutEditing, input.date).find((item) => item.material_id === input.material_id)?.balance;
    if (expected === null || expected === undefined) throw new Error('실사 전 예상 잔량을 계산할 수 없습니다.');
    return {
      event_id: editingId ?? id,
      date: input.date,
      material_id: input.material_id,
      event_type: '실사조정',
      quantity: new Decimal(input.quantity).minus(expected).toDecimalPlaces(1).toNumber(),
      counted_quantity: input.quantity,
      unit: material.unit,
      reason: input.reason,
      note: input.note,
    };
  }

  return {
    event_id: editingId ?? id,
    date: input.date,
    material_id: input.material_id,
    event_type: input.event_type,
    quantity: input.event_type === '폐기' ? -Math.abs(input.quantity) : input.quantity,
    unit: material.unit,
    reason: input.reason,
    ...(input.event_type === '입고' ? { supplier_id: input.supplier_id, unit_cost: input.unit_cost ?? 0 } : {}),
  };
}

export function assertSaleCanDelete(data, record) {
  const materialIds = relatedRecipeMaterials(data, record.menu_id, record.recipe_version, record.channel).map((item) => item.material_id);
  if (hasClosingStocktake(data, record.date, materialIds)) throw new Error('해당 날짜에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');
}

export function assertInventoryCanDelete(data, record) {
  if (record.event_type !== '실사조정' && hasClosingStocktake(data, record.date, [record.material_id], record.event_id)) throw new Error('해당 날짜에 마감 실사가 있습니다. 실사를 먼저 취소해 주세요.');
}
