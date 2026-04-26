import { useState, useEffect } from 'react';
import { getSyncStatus, SYNC_TTL, SOURCE_LABEL, type SyncRecord } from '../../api/sync';

function isStale(record: SyncRecord): boolean {
  const age = Math.floor(Date.now() / 1000) - record.synced_at;
  return age > SYNC_TTL[record.source] * 2;
}

export default function SyncStatusBanner() {
  const [problems, setProblems] = useState<SyncRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const records = await getSyncStatus();
        if (!cancelled) {
          setProblems(records.filter(r => r.status === 'failed' || isStale(r)));
        }
      } catch {
        // silently ignore — don't banner on a status-check failure
      }
    }

    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (problems.length === 0) return null;

  return (
    <div className="bg-md-red/10 border-b border-md-red/30 px-4 py-2 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-bold text-md-red uppercase tracking-wider shrink-0">Data Warning</span>
      <div className="flex flex-wrap gap-2">
        {problems.map(p => (
          <span key={p.source} className="text-xs text-md-red/80">
            {SOURCE_LABEL[p.source]}: {p.status === 'failed' ? `sync failed${p.detail ? ` — ${p.detail}` : ''}` : 'data may be stale'}
          </span>
        ))}
      </div>
      <a href="/admin" className="ml-auto text-xs text-md-red underline shrink-0">Admin</a>
    </div>
  );
}
