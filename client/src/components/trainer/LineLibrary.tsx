import { useState } from 'react';
import type { ComboLine } from '../../api/lines';
import { startersNotInDeck } from '../../utils/trainer';
import { StarterSlots, StatusBadge, cardName, type CardMap } from './shared';

export default function LineLibrary({
  lines, cards, mainDeck, busy, onNew, onEdit, onDelete, onMove, onImportAi,
}: {
  lines: ComboLine[];
  cards: CardMap;
  mainDeck: number[];
  busy: boolean;
  onNew: () => void;
  onEdit: (line: ComboLine) => void;
  onDelete: (line: ComboLine) => void;
  onMove: (line: ComboLine, direction: -1 | 1) => void;
  onImportAi: () => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onNew} className="press px-3 py-2 rounded-lg bg-md-blue text-white text-sm font-bold">+ New line</button>
        <button type="button" onClick={onImportAi} disabled={busy}
          className="press px-3 py-2 rounded-lg border border-md-border text-sm text-md-textSecondary disabled:opacity-50">
          Import AI drafts
        </button>
      </div>
      <p className="text-[11px] text-md-textMuted">
        Order = best end board first. When a hand can start several lines, the drill expects the highest one.
      </p>

      {lines.length === 0 ? (
        <div className="p-4 rounded-xl bg-md-surface border border-md-border text-sm text-md-textMuted">
          No lines yet. Add the lines you play from your most common starters first. The Coverage tab shows how often each one comes up.
        </div>
      ) : (
        <ol className="space-y-2">
          {lines.map((line, i) => {
            const cut = startersNotInDeck(line, mainDeck);
            const branchCount = line.steps.reduce((n, s) => n + s.branches.length, 0);
            const open = openId === line.id;
            return (
              <li key={line.id} className="rounded-xl bg-md-surface border border-md-border">
                <div className="flex items-start gap-2 p-3">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => onMove(line, -1)} disabled={busy || i === 0}
                      className="text-md-textMuted disabled:opacity-20 px-1 leading-none" aria-label="Move up">▲</button>
                    <span className="text-[10px] font-bold text-md-textMuted text-center">{i + 1}</span>
                    <button type="button" onClick={() => onMove(line, 1)} disabled={busy || i === lines.length - 1}
                      className="text-md-textMuted disabled:opacity-20 px-1 leading-none" aria-label="Move down">▼</button>
                  </div>
                  <button type="button" className="flex-1 text-left min-w-0" onClick={() => setOpenId(open ? null : line.id)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-sm text-md-text">{line.name}</span>
                      <StatusBadge line={line} />
                    </div>
                    <p className="text-[11px] text-md-textMuted mt-0.5">
                      {line.steps.length} step{line.steps.length === 1 ? '' : 's'} · {branchCount} interruption{branchCount === 1 ? '' : 's'}
                      {line.end_board ? ` · ends: ${line.end_board}` : ''}
                    </p>
                    {cut.length > 0 && (
                      <p className="text-[11px] text-md-red mt-0.5">Needs cards no longer in this deck: {cut.map((p) => cardName(cards, p)).join(', ')}</p>
                    )}
                  </button>
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-3 border-t border-md-border/40 pt-3">
                    <StarterSlots starters={line.starters} cards={cards} />
                    <ol className="space-y-1">
                      {line.steps.map((s, si) => (
                        <li key={s.id} className="text-sm text-md-textSecondary">
                          <span className="text-[10px] font-bold text-md-textMuted mr-2">{si + 1}</span>{s.text}
                          {s.branches.map((b) => (
                            <p key={b.id} className="ml-5 text-xs text-md-red/90">
                              If {b.interruption}: <span className="text-md-textSecondary">{b.response}</span>
                            </p>
                          ))}
                        </li>
                      ))}
                    </ol>
                    <div className="flex gap-3 text-xs">
                      <button type="button" onClick={() => onEdit(line)} className="text-md-blue font-semibold">Edit</button>
                      <button type="button" onClick={() => onDelete(line)} disabled={busy} className="text-md-red disabled:opacity-50">Delete</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
