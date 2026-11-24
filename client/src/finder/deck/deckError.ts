// The error a broken deck file gives: every problem, each naming its card and field. Kept apart
// from the compiler so the page can build and recognise it without loading the compiler.

import type { DeckFileError } from './schema';

export class DeckCompileError extends Error {
  errors: DeckFileError[];
  constructor(errors: DeckFileError[]) {
    super(errors.map((e) => `${e.card ? `${e.card}: ` : ''}${e.field ? `${e.field}: ` : ''}${e.message}`).join('; '));
    this.name = 'DeckCompileError';
    this.errors = errors;
  }
}
