import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import clsx from 'clsx';
import { syncAll } from '../../api/meta';
import CacheToggle from '../settings/CacheToggle';
import { hapticLight } from '../../utils/haptics';
import { useSyncUpdate } from '../../cache/SyncUpdateContext';

const items = [
  { to: '/cards', label: 'Card Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/ban-list', label: 'Ban List', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  { to: '/admin', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function MobileMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const { updateAvailable, applying, applyUpdate } = useSyncUpdate();

  const handleUpdate = async () => {
    await applyUpdate();
    onClose();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAll();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
      onClose();
    }
  };

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 transition-opacity',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 bg-md-surface border-t border-md-border/60 rounded-t-2xl shadow-2xl shadow-black/40 transition-transform',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-md-border" />
        </div>
        <div className="px-4 pb-2">
          <h3 className="text-xs font-bold text-md-textMuted uppercase tracking-widest mb-3">More</h3>
          <div className="grid grid-cols-1 gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => { hapticLight(); onClose(); }}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-md-blue/10 text-md-blue'
                      : 'text-md-textSecondary active:bg-md-surfaceHover'
                  )
                }
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
          <h3 className="text-xs font-bold text-md-textMuted uppercase tracking-widest mt-4 mb-3">Offline</h3>
          <div className="grid grid-cols-1 gap-1">
            <CacheToggle />
            <button
              type="button"
              onClick={() => { hapticLight(); void (updateAvailable ? handleUpdate() : handleSync()); }}
              disabled={syncing || applying}
              className={clsx(
                'press flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50',
                updateAvailable
                  ? 'text-md-gold bg-md-gold/10 active:bg-md-gold/20'
                  : 'text-md-blue bg-md-blue/10 active:bg-md-blue/20'
              )}
            >
              {syncing || applying ? (
                <span className={clsx(
                  'w-5 h-5 border-2 rounded-full animate-spin',
                  updateAvailable ? 'border-md-gold/30 border-t-md-gold' : 'border-md-blue/30 border-t-md-blue'
                )} />
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.586 9m0 0H9m11 11v-5m-6.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{applying ? 'Updating…' : syncing ? 'Syncing…' : updateAvailable ? 'Sync Update' : 'Sync all sources'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
