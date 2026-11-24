// The finder's Worker: one engine, built from the init message, runs every task it is sent.

import { handleMessage } from './runTask';
import type { Reply } from './protocol';
import type { Engine } from '../engine';

const ctx = self as unknown as { postMessage(m: Reply): void; onmessage: ((e: MessageEvent) => void) | null };
const box: { engine: Engine | null } = { engine: null };

ctx.onmessage = (e) => handleMessage(box, e.data, (r) => ctx.postMessage(r));
