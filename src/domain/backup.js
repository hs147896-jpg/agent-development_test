import { validateSeed } from './validation.js';

export const BACKUP_FORMAT = 'prep-cafe-backup';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_DATA_KEYS = [
  'suppliers',
  'materials',
  'menus',
  'recipes',
  'price_history',
  'calendar',
  'sales',
  'opening_inventory',
  'inventory_events',
  'monthly_expense_plan',
  'expenses',
];

export function backupCounts(data) {
  return Object.fromEntries(BACKUP_DATA_KEYS.map((key) => [key, Array.isArray(data[key]) ? data[key].length : -1]));
}

export function createBackupObject(data, { createdAt = new Date().toISOString(), appVersion = '0.1.0' } = {}) {
  const validated = validateSeed(data);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    createdAt,
    storeName: validated.meta.store_name,
    counts: backupCounts(validated),
    data: validated,
  };
}

export function validateBackupObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('백업 파일의 JSON 구조를 확인해 주세요.');
  if (input.format !== BACKUP_FORMAT) throw new Error('프렙 카페 백업 파일이 아닙니다.');
  if (input.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`지원하지 않는 백업 버전입니다: ${input.schemaVersion ?? '없음'}`);
  if (!input.createdAt || Number.isNaN(Date.parse(input.createdAt))) throw new Error('백업 생성 시각을 확인할 수 없습니다.');
  const data = validateSeed(input.data);
  const actualCounts = backupCounts(data);
  for (const key of BACKUP_DATA_KEYS) {
    if (input.counts?.[key] !== actualCounts[key]) throw new Error(`${key} 기록 건수가 백업 요약과 다릅니다.`);
  }
  return { ...input, counts: actualCounts, data };
}

export function parseBackupText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('손상되거나 JSON이 아닌 파일입니다.');
  }
  return validateBackupObject(parsed);
}

export function backupFilename(createdAt = new Date()) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `prep-cafe-backup_${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}.json`;
}
