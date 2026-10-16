import type { Inquiry } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Optional AI assistance (AI_PROVIDER=anthropic). Outputs are suggestions only: they are stored for staff
 * to review and are never sent to clients automatically. Without a key, features are reported as unavailable.
 */
export const aiConfigured = () => env.AI_PROVIDER === 'anthropic' && !!env.ANTHROPIC_API_KEY;

export async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  if (!aiConfigured()) throw new Error('AI assistance is not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status})`);
  const json = (await r.json()) as { content?: { type: string; text?: string }[] };
  return json.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') ?? '';
}

export function extractJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

export interface InquiryClassification {
  category: string;
  priority: 'low' | 'medium' | 'high';
  summary: string;
  suggestedServices: string[];
  generatedAt: string;
  reviewed: false;
}

export async function classifyInquiry(inq: Inquiry): Promise<InquiryClassification | null> {
  if (!aiConfigured()) return null;
  try {
    const text = await callClaude(
      'You triage event-planning inquiries for a luxury event agency. Respond with JSON only: {"category": string, "priority": "low"|"medium"|"high", "summary": string (max 40 words), "suggestedServices": string[] (max 6)}. Base priority on budget, guest count and date proximity. Do not invent facts.',
      JSON.stringify({ eventType: inq.eventType, date: inq.eventDate, location: inq.location, guests: inq.guestCount, budget: inq.budgetRange, services: inq.services, notes: inq.notes.slice(0, 1500), theme: inq.themePreferences.slice(0, 500) }),
      400,
    );
    const parsed = extractJson<Omit<InquiryClassification, 'generatedAt' | 'reviewed'>>(text);
    if (!parsed) return null;
    return { ...parsed, generatedAt: new Date().toISOString(), reviewed: false };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'AI classification failed');
    return null;
  }
}
