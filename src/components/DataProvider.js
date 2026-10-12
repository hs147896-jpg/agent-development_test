'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import seedData from '@/data/seed.json';
import { createBackupObject } from '@/domain/backup';
import { deleteRecord, importSales, initializeDatabase, readAllData, restoreBackup as restoreDatabase, saveExpense, saveInventoryEvent, saveSale, setDateClosed } from '@/db/database';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', data: null, message: '초기 자료를 확인하고 있습니다.' });
  const [storagePersisted, setStoragePersisted] = useState(null);

  const load = useCallback(async () => {
    try {
      await initializeDatabase(seedData);
      const data = await readAllData();
      setState({ status: 'ready', data, message: '저장된 자료를 불러왔습니다.' });
    } catch (error) {
      setState({ status: 'error', data: null, message: error instanceof Error ? error.message : '자료를 열 수 없습니다.' });
    }
  }, []);

  useEffect(() => {
    load();
    if (navigator.storage?.persist) {
      navigator.storage.persist().then(setStoragePersisted).catch(() => setStoragePersisted(false));
    } else {
      setStoragePersisted(false);
    }
  }, [load]);

  const toggleClose = useCallback(async (date, complete) => {
    setState((current) => ({ ...current, status: 'saving', message: '마감 상태를 저장하고 있습니다.' }));
    try {
      await setDateClosed(date, complete);
      const data = await readAllData();
      setState({ status: 'ready', data, message: complete ? `${date} 마감을 완료했습니다.` : `${date} 마감을 취소했습니다.` });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : '마감 상태를 저장하지 못했습니다.' }));
      return false;
    }
  }, []);

  const saveRecord = useCallback(async (kind, input, editingId) => {
    setState((current) => ({ ...current, status: 'saving', message: '기록을 저장하고 있습니다.' }));
    try {
      const action = kind === 'sales' ? saveSale : kind === 'expenses' ? saveExpense : kind === 'inventory' ? saveInventoryEvent : null;
      if (!action) throw new Error('지원하지 않는 기록 종류입니다.');
      await action(input, editingId);
      const data = await readAllData();
      setState({ status: 'ready', data, message: editingId ? '기록을 수정했습니다.' : '새 기록을 저장했습니다.' });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '기록을 저장하지 못했습니다.';
      setState((current) => ({ ...current, status: 'ready', message }));
      return { ok: false, error: message };
    }
  }, []);

  const removeRecord = useCallback(async (kind, id) => {
    setState((current) => ({ ...current, status: 'saving', message: '기록을 삭제하고 있습니다.' }));
    try {
      await deleteRecord(kind, id);
      const data = await readAllData();
      setState({ status: 'ready', data, message: '기록을 삭제했습니다.' });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '기록을 삭제하지 못했습니다.';
      setState((current) => ({ ...current, status: 'ready', message }));
      return { ok: false, error: message };
    }
  }, []);

  const importSaleRecords = useCallback(async (inputs) => {
    setState((current) => ({ ...current, status: 'saving', message: '엑셀 판매 기록을 저장하고 있습니다.' }));
    try {
      const records = await importSales(inputs);
      const data = await readAllData();
      setState({ status: 'ready', data, message: `판매 ${records.length.toLocaleString('ko-KR')}건을 가져왔습니다.` });
      return { ok: true, count: records.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '엑셀 기록을 저장하지 못했습니다.';
      setState((current) => ({ ...current, status: 'ready', message: errorMessage }));
      return { ok: false, error: errorMessage };
    }
  }, []);

  const makeBackup = useCallback(async () => {
    const current = await readAllData();
    return createBackupObject(current);
  }, []);

  const restoreAll = useCallback(async (backup) => {
    setState((current) => ({ ...current, status: 'saving', message: '백업 자료로 전체 복원하고 있습니다.' }));
    try {
      const restored = await restoreDatabase(backup);
      const data = await readAllData();
      setState({ status: 'ready', data, message: `백업(${restored.createdAt})을 복원했습니다.` });
      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '전체 복원을 완료하지 못했습니다.';
      setState((current) => ({ ...current, status: 'ready', message: errorMessage }));
      return { ok: false, error: errorMessage };
    }
  }, []);

  const value = useMemo(() => ({
    ...state,
    storagePersisted,
    reload: load,
    toggleClose,
    saveRecord,
    removeRecord,
    importSaleRecords,
    makeBackup,
    restoreAll,
  }), [state, storagePersisted, load, toggleClose, saveRecord, removeRecord, importSaleRecords, makeBackup, restoreAll]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useCafeData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('DataProvider 안에서 사용해야 합니다.');
  return value;
}
