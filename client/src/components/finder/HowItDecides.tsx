// "How it decides": the artifact's explainer, with the deck's name, its card count, its
// protections and the draw effects read from the data.

import type { DeckFile, HandTrapFile } from '../../finder/deck/schema';
import { howItDecides } from '../../finder/model/lineView';

export default function HowItDecides({ deckName, cardCount, file, traps }: { deckName: string; cardCount: number; file: Pick<DeckFile, 'protections'>; traps: HandTrapFile }) {
  return (
    <details className="group p-3 sm:p-4 rounded-xl bg-md-surface border border-md-border">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-bold text-md-text">
        How it decides
        <span className="text-md-textMuted transition-transform group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <div className="mt-2 space-y-2">
        {howItDecides(deckName, cardCount, file, traps).map((t, i) => <p key={i} className="text-[12px] leading-relaxed text-md-textSecondary">{t}</p>)}
      </div>
    </details>
  );
}
