// "Save to my lines": sends a found line to the server as a Line Finder draft.

import type { importGenerated } from '../../api/lines';
import type { SerializedLine } from '../engine/serialize';

const WAKING = [502, 503, 504];

export type SaveResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveFoundLine(
  deckId: number, line: SerializedLine, name: string, send: typeof importGenerated,
): Promise<SaveResult> {
  try {
    const r = await send(deckId, JSON.stringify({ lines: [{ ...line.generated, name }] }), { generator: 'Line Finder', source: 'solver' });
    if (r.rejected.length > 0) return { ok: false, message: `The server could not read that line: ${r.rejected[0].error}` };
    if (r.failing > 0) return { ok: true, message: 'Saved as a draft. The card ledger flagged it; check it in Lines.' };
    return { ok: true, message: 'Saved to your lines as a draft.' };
  } catch (err) {
    const e = err as { name?: unknown; status?: unknown; message?: unknown } | null;
    // No answer at all, or the gateway's answer while the sleeping server wakes up.
    if (e?.name === 'ApiError' && (e.status === null || WAKING.includes(e.status as number))) {
      return { ok: false, message: "Can't reach the server. The line stays here; try again in a minute." };
    }
    return { ok: false, message: typeof e?.message === 'string' && e.message ? e.message : String(err) };
  }
}
