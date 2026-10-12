'use client';

import { useRef, useState } from 'react';
import { backupFilename, parseBackupText } from '@/domain/backup';
import { useCafeData } from './DataProvider';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BackupDialog() {
  const { data, status, storagePersisted, makeBackup, restoreAll } = useCafeData();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState(null);
  const fileRef = useRef(null);

  function resetAndClose() {
    setOpen(false);
    setCandidate(null);
    setError('');
    setNotice('');
  }

  async function downloadBackup() {
    setError('');
    setNotice('백업 파일을 만드는 중입니다.');
    try {
      const backup = await makeBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, backupFilename(backup.createdAt));
      setNotice(`판매 ${backup.counts.sales.toLocaleString('ko-KR')}건을 포함한 전체 백업을 내려받았습니다.`);
    } catch (downloadError) {
      setNotice('');
      setError(downloadError instanceof Error ? downloadError.message : '백업 파일을 만들지 못했습니다.');
    }
  }

  async function chooseRestoreFile(event) {
    const file = event.target.files?.[0];
    setCandidate(null);
    setNotice('');
    setError('');
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('JSON 백업 파일만 선택해 주세요.');
      if (file.size > 50 * 1024 * 1024) throw new Error('백업 파일은 50MB 이하만 지원합니다.');
      const parsed = parseBackupText(await file.text());
      setCandidate({ fileName: file.name, backup: parsed });
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : '복원 파일을 읽지 못했습니다.');
    } finally {
      event.target.value = '';
    }
  }

  async function confirmRestore() {
    setError('');
    const result = await restoreAll(candidate.backup);
    if (result.ok) {
      setNotice(`복원 완료 · 판매 ${candidate.backup.counts.sales.toLocaleString('ko-KR')}건 · 기준일 ${candidate.backup.data.meta.as_of}`);
      setCandidate(null);
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <button className="utility-button" type="button" onClick={() => setOpen(true)}>백업·복원</button>
      {open && <div className="modal-backdrop" role="presentation">
        <section className="record-modal backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
          <div className="modal-heading">
            <div><p className="eyebrow">브라우저 내부에서만 처리</p><h2 id="backup-title">전체 백업·복원</h2></div>
            <button type="button" className="modal-close" aria-label="닫기" onClick={resetAndClose}>×</button>
          </div>

          <div className="backup-grid">
            <section>
              <p className="eyebrow">01 백업</p>
              <h3>현재 자료를 JSON으로 보관</h3>
              <p className="subtle">판매·비용·재고·마감·기준정보와 설정을 파일 하나에 담습니다.</p>
              {data && <dl className="backup-summary"><div><dt>판매</dt><dd>{data.sales.length.toLocaleString('ko-KR')}건</dd></div><div><dt>비용</dt><dd>{data.expenses.length.toLocaleString('ko-KR')}건</dd></div><div><dt>재고 기록</dt><dd>{data.inventory_events.length.toLocaleString('ko-KR')}건</dd></div></dl>}
              <button className="button primary" type="button" disabled={!data || status === 'saving'} onClick={downloadBackup}>지금 백업 파일 생성</button>
            </section>

            <section>
              <p className="eyebrow">02 복원</p>
              <h3>백업 시점으로 전체 교체</h3>
              <p className="subtle">파일을 선택하면 형식·버전·필수 자료·기록 건수를 먼저 검사합니다.</p>
              <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={chooseRestoreFile} />
              <button className="button secondary" type="button" onClick={() => fileRef.current?.click()}>복원 파일 선택</button>
            </section>
          </div>

          <p className={`storage-note ${storagePersisted ? 'ok' : 'warn'}`}>
            {storagePersisted ? '브라우저가 이 사이트의 자료를 영구 저장으로 보호하고 있습니다.' : '브라우저 자료를 지우면 복구할 수 없습니다. 정기적으로 JSON 백업을 보관하세요.'}
          </p>

          {candidate && <section className="restore-confirm" role="alert">
            <p className="eyebrow">검사 통과 · {candidate.fileName}</p>
            <h3>현재 자료 전체가 아래 백업으로 바뀍니다.</h3>
            <p>생성 {new Date(candidate.backup.createdAt).toLocaleString('ko-KR')} · 판매 {candidate.backup.counts.sales.toLocaleString('ko-KR')}건 · 비용 {candidate.backup.counts.expenses.toLocaleString('ko-KR')}건 · 재고 {candidate.backup.counts.inventory_events.toLocaleString('ko-KR')}건</p>
            <p className="subtle">필요하면 먼저 현재 자료를 백업하세요. 기존 자료와 합치지 않습니다.</p>
            <button className="button danger-button" type="button" disabled={status === 'saving'} onClick={confirmRestore}>{status === 'saving' ? '전체 복원 중…' : '현재 자료를 교체하고 복원'}</button>
          </section>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </div>}
    </>
  );
}
