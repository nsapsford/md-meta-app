import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { getSyncStatus, type SyncRecord } from '../../api/sync';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/cards', label: 'Card Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/matchups', label: 'Matchups', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { to: '/ban-list', label: 'Ban List', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  { to: '/trends', label: 'Meta Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { to: '/tournaments', label: 'Tournaments', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { to: '/deck-builder', label: 'Deck Builder', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
];

const SOURCE_LABELS: Record<string, string> = {
  ygoprodeck: 'YGOProDeck',
  mdm_deck_types: 'MDM Decks',
  mdm_tournaments: 'Tournaments',
  untapped: 'Untapped.gg',
};

function formatAge(syncedAt: number): string {
  const mins = Math.floor((Date.now() / 1000 - syncedAt) / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function dotColor(record: SyncRecord): string {
  if (record.status === 'failed') return 'bg-md-red';
  if (record.status === 'partial') return 'bg-md-orange';
  const ageHrs = (Date.now() / 1000 - record.synced_at) / 3600;
  if (ageHrs > 12) return 'bg-md-red';
  if (ageHrs > 2) return 'bg-md-orange';
  return 'bg-md-green animate-pulse';
}

export default function Sidebar() {
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);

  useEffect(() => {
    getSyncStatus().then(setSyncRecords).catch(() => {});
  }, []);

  return (
    <nav className="w-56 min-h-[calc(100vh-4rem)] border-r border-md-border/30 bg-gradient-to-b from-md-surface/50 to-md-surface/30 py-5 px-3 flex flex-col gap-1 shadow-lg shadow-black/5">
      <div className="mb-2 px-2">
        <h3 className="text-xs font-bold text-md-textMuted uppercase tracking-widest">Navigation</h3>
      </div>

      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group',
              isActive
                ? 'bg-gradient-to-r from-md-blue/15 to-md-blue/5 text-md-blue border border-md-blue/20 shadow-md shadow-md-blue/10 nav-active'
                : 'text-md-textMuted hover:text-md-textSecondary hover:bg-md-surfaceHover/40'
            )
          }
        >
          <svg className="w-5 h-5 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
          </svg>
          <span className="group-hover:translate-x-1 transition-transform">{item.label}</span>
        </NavLink>
      ))}

      <div className="mt-auto pt-4 border-t border-md-border/20">
        <div className="px-3 py-3 rounded-xl bg-md-surface/40 border border-md-border/30 space-y-2">
          <p className="text-[10px] font-bold text-md-textMuted uppercase tracking-widest mb-1">Data Sources</p>
          {syncRecords.length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-md-textMuted" />
              <span className="text-[10px] text-md-textMuted">No sync data yet</span>
            </div>
          ) : (
            syncRecords.map((r) => (
              <div key={r.source} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(r)}`} />
                <div className="min-w-0">
                  <span className="text-[10px] font-medium text-md-textSecondary">
                    {SOURCE_LABELS[r.source] ?? r.source}
                  </span>
                  <span className="text-[10px] text-md-textMuted ml-1">
                    {r.status === 'failed' ? '— failed' : formatAge(r.synced_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </nav>
  );
}
