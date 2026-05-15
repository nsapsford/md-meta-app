import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import MobileMoreSheet from './MobileMoreSheet';

const tabs = [
  { to: '/', label: 'Home', end: true, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/matchups', label: 'Matchups', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { to: '/deck-builder', label: 'Decks', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { to: '/trends', label: 'Trends', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
];

export default function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 border-t border-md-border/60 bg-md-bg/95 backdrop-blur-xl shadow-2xl shadow-black/30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5 h-14">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors',
                  isActive ? 'text-md-blue' : 'text-md-textMuted active:text-md-text'
                )
              }
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
              </svg>
              <span>{t.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={clsx(
              'flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors',
              moreOpen ? 'text-md-blue' : 'text-md-textMuted active:text-md-text'
            )}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h.01M12 12h.01M19 12h.01" />
            </svg>
            <span>More</span>
          </button>
        </div>
      </nav>
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
