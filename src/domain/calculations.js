import Decimal from 'decimal.js';
import { datesBetween, getPeriodRange, monthsBetween } from './periods.js';

const D = (value = 0) => new Decimal(value ?? 0);
const rounded = (value) => D(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const inRange = (date, range) => date >= range.start && date <= range.end;

function salesCost(sale) {
  const food = D(sale.quantity).times(sale.unit_food_cost_snapshot);
  const packaging = D(sale.quantity).times(sale.unit_packaging_cost_snapshot);
  return { food, packaging };
}

function aggregateSales(sales) {
  const total = sales.reduce((acc, sale) => {
    const costs = salesCost(sale);
    acc.quantity = acc.quantity.plus(sale.quantity);
    acc.netSales = acc.netSales.plus(sale.net_sales);
    acc.discount = acc.discount.plus(sale.discount_amount ?? 0);
    acc.paymentFee = acc.paymentFee.plus(sale.payment_fee);
    acc.food = acc.food.plus(costs.food);
    acc.packaging = acc.packaging.plus(costs.packaging);
    return acc;
  }, { quantity: D(0), netSales: D(0), discount: D(0), paymentFee: D(0), food: D(0), packaging: D(0) });
  const direct = total.food.plus(total.packaging).plus(total.paymentFee);
  const contribution = total.netSales.minus(direct);
  return {
    quantity: total.quantity.toNumber(),
    netSales: rounded(total.netSales),
    discount: rounded(total.discount),
    paymentFee: rounded(total.paymentFee),
    food: rounded(total.food),
    packaging: rounded(total.packaging),
    direct: rounded(direct),
    contribution: rounded(contribution),
  };
}

export function calculatePerformance(data, unit = 'month', referenceDate = data.meta.as_of) {
  const range = getPeriodRange(unit, referenceDate);
  const calendarInRange = data.calendar.filter((item) => inRange(item.date, range));
  const closedDates = new Set(calendarInRange.filter((item) => item.record_complete === true).map((item) => item.date));
  const unclosed = calendarInRange.filter((item) => item.record_complete !== true);
  const sales = data.sales.filter((item) => closedDates.has(item.date));
  const expenses = data.expenses.filter((item) => closedDates.has(item.date));
  const salesTotals = aggregateSales(sales);
  const operatingExpenses = rounded(expenses.reduce((sum, item) => sum.plus(item.amount), D(0)));
  const operatingProfit = rounded(D(salesTotals.contribution).minus(operatingExpenses));
  const margin = salesTotals.netSales === 0 ? null : D(operatingProfit).div(salesTotals.netSales).times(100).toDecimalPlaces(1).toNumber();
  const plan = ['month', 'quarter', 'half', 'year'].includes(unit)
    ? rounded(data.monthly_expense_plan.filter((item) => monthsBetween(range.start, range.end).includes(item.month)).reduce((sum, item) => sum.plus(item.amount), D(0)))
    : null;

  const channels = ['매장', '포장'].map((channel) => {
    const result = aggregateSales(sales.filter((item) => item.channel === channel));
    return { ...result, channel, share: salesTotals.netSales === 0 ? null : D(result.netSales).div(salesTotals.netSales).times(100).toDecimalPlaces(1).toNumber() };
  });
  const unknownSales = sales.filter((item) => !['매장', '포장'].includes(item.channel));
  if (unknownSales.length) channels.push({ ...aggregateSales(unknownSales), channel: '채널 확인 필요', share: null });

  const daily = calendarInRange.map((calendar) => {
    if (!calendar.record_complete) return { ...calendar, closed: false };
    const daySales = aggregateSales(data.sales.filter((item) => item.date === calendar.date));
    const dayExpenses = rounded(data.expenses.filter((item) => item.date === calendar.date).reduce((sum, item) => sum.plus(item.amount), D(0)));
    return { ...calendar, ...daySales, operatingExpenses: dayExpenses, operatingProfit: rounded(D(daySales.contribution).minus(dayExpenses)), closed: true };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const closedList = [...closedDates].sort();
  return {
    range,
    closedRange: closedList.length ? { start: closedList[0], end: closedList.at(-1) } : null,
    closedCount: closedList.length,
    unclosed,
    ...salesTotals,
    operatingExpenses,
    operatingProfit,
    margin,
    plan,
    channels,
    daily,
  };
}

export function calculateMenuProfitability(data, unit = 'month', referenceDate = data.meta.as_of) {
  const range = getPeriodRange(unit, referenceDate);
  const closedDates = new Set(data.calendar.filter((item) => inRange(item.date, range) && item.record_complete === true).map((item) => item.date));
  return data.menus.map((menu) => {
    const rows = data.sales.filter((item) => item.menu_id === menu.menu_id && closedDates.has(item.date));
    const totals = aggregateSales(rows);
    const margin = totals.netSales <= 0 ? null : D(totals.contribution).div(totals.netSales).times(100).toDecimalPlaces(1).toNumber();
    const storeQty = rows.filter((row) => row.channel === '매장').reduce((sum, row) => sum + row.quantity, 0);
    const takeoutQty = rows.filter((row) => row.channel === '포장').reduce((sum, row) => sum + row.quantity, 0);
    return { ...menu, ...totals, margin, storeQty, takeoutQty };
  });
}

export function getMenuRecipeDetail(data, menuId, referenceDate = data.meta.as_of) {
  const menu = data.menus.find((item) => item.menu_id === menuId);
  if (!menu) return [];
  return data.recipes.filter((item) => item.menu_id === menuId && item.recipe_version === menu.recipe_version).map((recipe) => {
    const material = data.materials.find((item) => item.material_id === recipe.material_id);
    const prices = data.price_history.filter((item) => item.material_id === recipe.material_id && item.effective_date <= referenceDate).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    const price = prices[0];
    const cost = price ? D(price.pack_price).div(price.pack_quantity).times(recipe.quantity).toDecimalPlaces(1).toNumber() : null;
    return { ...recipe, materialName: material?.name ?? recipe.material_id, cost, priceDate: price?.effective_date ?? null };
  });
}

export function calculateInventory(data, referenceDate = data.meta.as_of) {
  const supplierMap = new Map(data.suppliers.map((item) => [item.supplier_id, item.name]));
  return data.materials.map((material) => {
    const opening = data.opening_inventory.find((item) => item.material_id === material.material_id);
    const events = data.inventory_events.filter((item) => item.material_id === material.material_id && item.date <= referenceDate).sort((a, b) => a.date.localeCompare(b.date));
    const stocktakes = events.filter((item) => item.event_type === '실사조정' && Number.isFinite(item.counted_quantity));
    const latestStocktake = stocktakes.at(-1);
    const afterDate = latestStocktake?.date ?? null;
    const applicableEvents = events.filter((item) => item.event_type !== '실사조정' && (!afterDate || item.date > afterDate));
    const receiptsAfter = applicableEvents.filter((item) => item.event_type === '입고').reduce((sum, item) => sum.plus(item.quantity), D(0));
    const wasteAfter = applicableEvents.filter((item) => item.event_type === '폐기').reduce((sum, item) => sum.plus(Math.abs(item.quantity)), D(0));

    const recipes = data.recipes.filter((item) => item.material_id === material.material_id);
    const usageAfter = data.sales.filter((sale) => sale.date <= referenceDate && (!afterDate || sale.date > afterDate)).reduce((sum, sale) => {
      const applicable = recipes.filter((recipe) => recipe.menu_id === sale.menu_id && recipe.recipe_version === sale.recipe_version && (!recipe.channel_only || recipe.channel_only === sale.channel));
      return applicable.reduce((recipeSum, recipe) => recipeSum.plus(D(sale.quantity).times(recipe.quantity)), sum);
    }, D(0));

    const base = latestStocktake ? D(latestStocktake.counted_quantity) : opening ? D(opening.quantity) : null;
    const balance = base ? base.plus(receiptsAfter).minus(wasteAfter).minus(usageAfter) : null;
    const totalReceipts = events.filter((item) => item.event_type === '입고').reduce((sum, item) => sum.plus(item.quantity), D(0));
    const totalWaste = events.filter((item) => item.event_type === '폐기').reduce((sum, item) => sum.plus(Math.abs(item.quantity)), D(0));
    const totalUsage = data.sales.filter((sale) => sale.date <= referenceDate).reduce((sum, sale) => {
      const applicable = recipes.filter((recipe) => recipe.menu_id === sale.menu_id && recipe.recipe_version === sale.recipe_version && (!recipe.channel_only || recipe.channel_only === sale.channel));
      return applicable.reduce((recipeSum, recipe) => recipeSum.plus(D(sale.quantity).times(recipe.quantity)), sum);
    }, D(0));
    const numericBalance = balance === null ? null : balance.toDecimalPlaces(1).toNumber();
    return {
      ...material,
      supplierName: supplierMap.get(material.supplier_id) ?? '공급사 확인 필요',
      opening: opening?.quantity ?? null,
      receipts: totalReceipts.toNumber(),
      waste: totalWaste.toNumber(),
      usage: totalUsage.toNumber(),
      latestCount: latestStocktake?.counted_quantity ?? null,
      latestCountDate: latestStocktake?.date ?? null,
      balance: numericBalance,
      status: numericBalance === null ? '기준 재고 없음' : numericBalance < 0 ? '기록 점검 필요' : numericBalance === 0 ? '소진' : '정상',
    };
  });
}
