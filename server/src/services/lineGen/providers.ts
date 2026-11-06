// Model providers for the line generator. Server-side generation needs an
// API credential (a Claude subscription can't be used by the app itself);
// without one, the paste-in flow (buildPastePrompt + import) still works.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';

export interface LineModel {
  /** Recorded on generated lines, e.g. "claude-opus-5-5". */
  readonly id: string;
  complete(prompt: string): Promise<string>;
}

export const LINE_MODEL_ANTHROPIC = 'claude-opus-5-5';
// Server-side fallback if the main model declines a request.
const ANTHROPIC_FALLBACK = 'claude-opus-4-8';

class AnthropicLineModel implements LineModel {
  readonly id = LINE_MODEL_ANTHROPIC;
  private client = new Anthropic({ apiKey: config.anthropicApiKey });

  async complete(prompt: string): Promise<string> {
    // Long reasoning + long JSON: stream so the request can't hit an HTTP timeout.
    const stream = this.client.beta.messages.stream({
      model: this.id,
      max_tokens: 64000,
      // Thinking is always on for this model; effort controls its depth.
      output_config: { effort: 'high' },
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: ANTHROPIC_FALLBACK }],
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('The model declined this request');
    if (msg.stop_reason === 'max_tokens') throw new Error('The model ran out of output space');
    const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    if (!text.trim()) throw new Error('Model returned no text');
    return text;
  }
}

class GeminiLineModel implements LineModel {
  readonly id: string;
  constructor(model: string) { this.id = model; }

  async complete(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.id}:generateContent?key=${config.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('Model returned no text');
    return text;
  }
}

/** The configured server-side model, or null when only the paste-in flow is available. */
export function getLineModel(): LineModel | null {
  if (config.anthropicApiKey) return new AnthropicLineModel();
  if (config.geminiApiKey) return new GeminiLineModel(process.env.LINE_GEMINI_MODEL || config.geminiModel);
  return null;
}
