import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  getGenerator, getGeneratePrompt, importGenerated, startGeneration, getGenerationJob,
  type GenerationJob, type ImportResult,
} from '../../api/lines';
import { copyText } from '../../utils/deckShare';

/**
 * Two ways to get checked lines for a deck:
 *  - "With Claude": copy a prompt grounded in the full deck (main + Extra Deck,
 *    full card text), run it in Claude Code or claude.ai, paste the answer back.
 *    Works on a Claude subscription; no API key needed.
 *  - "On the server": when the server has a model API key configured.
 * Either way the app replays every line on a card ledger and flags problems.
 */
export default function GeneratePanel({ deckId, onImported, onClose }: {
  deckId: number;
  onImported: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [serverModel, setServerModel] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [repairCopied, setRepairCopied] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { getGenerator().then((g) => setServerModel(g.serverModel)).catch(() => {}); }, []);

  // Poll a running server job.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = window.setTimeout(async () => {
      try {
        const next = await getGenerationJob(job.id);
        setJob(next);
        if (next.status === 'done') await onImported();
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); setJob(null); }
    }, 3000);
    return () => window.clearTimeout(t);
  }, [job, onImported]);

  async function copyPrompt() {
    setCopying(true); setError('');
    try {
      const { prompt, missing } = await getGeneratePrompt(deckId);
      await copyText(prompt);
      setCopied(true);
      if (missing.length) setError(`${missing.length} card(s) in this deck aren't in the card database yet, so the prompt leaves them out.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setCopying(false); }
  }

  async function doImport() {
    setImporting(true); setError(''); setResult(null);
    try {
      const r = await importGenerated(deckId, pasted);
      setResult(r);
      setPasted('');
      await onImported();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setImporting(false); }
  }

  async function runOnServer() {
    setError('');
    try { setJob(await startGeneration(deckId)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const box = 'p-3 rounded-xl border border-md-border bg-md-bg/40 space-y-2';
  const btn = 'press px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50';

  return (
    <div className="space-y-3 p-4 rounded-2xl bg-md-surface border border-md-blue/30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-md-text">Generate lines</p>
          <p className="text-[11px] text-md-textMuted">
            The model sees your whole list (Main + Extra Deck, full card text). Every line it writes is replayed card by card;
            anything that can't happen is flagged on the line. You then verify the line in Master Duel.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-md-textMuted text-sm" aria-label="Close">✕</button>
      </div>

      <div className={box}>
        <p className="text-xs font-bold text-md-text">With Claude (your subscription)</p>
        <ol className="text-[11px] text-md-textMuted list-decimal ml-4 space-y-0.5">
          <li>Copy the prompt and paste it into Claude Code or claude.ai.</li>
          <li>Paste Claude's whole answer below and import.</li>
        </ol>
        <button type="button" onClick={copyPrompt} disabled={copying}
          className={clsx(btn, 'bg-md-blue text-white')}>
          {copying ? 'Building prompt…' : copied ? 'Copied ✓ (copy again)' : '1. Copy prompt'}
        </button>
        <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4}
          placeholder={'2. Paste the answer here ({"lines": [...]})'}
          className="w-full bg-md-bg border border-md-border rounded-lg px-2.5 py-2 text-xs text-md-text font-mono focus:outline-none focus:border-md-blue" />
        <button type="button" onClick={doImport} disabled={importing || !pasted.trim()}
          className={clsx(btn, 'bg-md-blue/15 text-md-blue border border-md-blue/30')}>
          {importing ? 'Checking…' : 'Import & check'}
        </button>
        {result && (
          <div className="text-xs space-y-1.5">
            <p className="text-md-green">
              {result.created.length} line{result.created.length === 1 ? '' : 's'} imported as drafts
              {result.failing ? `; ${result.failing} with problems flagged` : ', all passed the checks'}.
            </p>
            {result.rejected.map((r) => (
              <p key={r.name} className="text-md-red">Skipped "{r.name}": {r.error}</p>
            ))}
            {result.repairPrompt && (
              <button type="button"
                onClick={async () => { await copyText(result.repairPrompt!); setRepairCopied(true); }}
                className={clsx(btn, 'bg-md-orange/15 text-md-orange border border-md-orange/30')}>
                {repairCopied ? 'Fix-up prompt copied ✓' : 'Copy fix-up prompt for Claude'}
              </button>
            )}
            {result.repairPrompt && (
              <p className="text-[11px] text-md-textMuted">Paste it into the same Claude chat, then import its answer here. Fixed lines replace the flagged drafts.</p>
            )}
          </div>
        )}
      </div>

      <div className={box}>
        <p className="text-xs font-bold text-md-text">On the server</p>
        {serverModel ? (
          <>
            <p className="text-[11px] text-md-textMuted">
              Uses {serverModel}: finds your starters, writes one line each, checks it, repairs it, then a second pass judges it
              against the card text. Takes a few minutes. Needs the admin token.
            </p>
            <button type="button" onClick={runOnServer} disabled={job?.status === 'running'}
              className={clsx(btn, 'bg-md-surfaceHover text-md-text border border-md-border')}>
              {job?.status === 'running' ? 'Generating…' : 'Generate on server'}
            </button>
            {job && (
              <div className="text-[11px] text-md-textMuted space-y-0.5">
                {job.progress.slice(-4).map((p, i) => <p key={i}>{p}</p>)}
                {job.status === 'done' && <p className="text-md-green">{job.created} line(s) added.</p>}
                {job.status === 'failed' && <p className="text-md-red">{job.error}</p>}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-md-textMuted">
            Not set up: the server has no model API key. A Claude subscription can't be used by the app itself,
            so use "With Claude" above.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-md-red">{error}</p>}
    </div>
  );
}
