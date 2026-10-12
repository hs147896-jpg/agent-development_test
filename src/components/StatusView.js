'use client';

export function StatusView({ status, message, onRetry }) {
  if (status === 'ready') return null;
  const isError = status === 'error';
  return (
    <section className={`status-panel ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>
      <span className="status-icon">{isError ? '!' : '•••'}</span>
      <div>
        <strong>{isError ? '자료를 표시할 수 없습니다' : status === 'saving' ? '저장 중' : '자료를 여는 중'}</strong>
        <p>{message}</p>
      </div>
      {isError && onRetry ? <button type="button" className="button secondary" onClick={onRetry}>다시 시도</button> : null}
    </section>
  );
}
