// ============================================================
// AI Суммаризация по источникам через DeepSeek API
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles } from '../db.js';
import { validateInt, validateStringArray } from '../validation.js';

const router = Router();
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

// ==================== Промпт ====================

const SUMMARIZE_SOURCES_PROMPT = `Ты — профессиональный аналитик строительной отрасли России.
Сделай аналитическую сводку по новостям из указанного источника за заданный период.
Формат: 1) **Общая картина** 2) **Ключевые события** (до 5) 3) **Выводы**`;

// ==================== Helpers ====================

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY не задан в .env на сервере');
  return key;
}

async function callDeepSeek(systemPrompt: string, userPrompt: string, maxTokens: number = 2000): Promise<string> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) { const err = await res.text(); throw new Error(`DeepSeek API ${res.status}: ${err.slice(0, 200)}`); }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('DeepSeek API: превышен таймаут (60с)');
    throw err;
  }
}

// ==================== Endpoint ====================

// POST /api/summarize/sources — сводка по источникам за период
router.post('/summarize/sources', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const sourceIds = validateStringArray(req.body.sourceIds, 10, 50);
  const daysBack = validateInt(req.body.daysBack, 1, 30, 7);
  const maxLength = validateInt(req.body.maxLength, 100, 1000, 400);

  const { articles } = readArticles(undefined, daysBack, 1000, 0);

  if (articles.length === 0) {
    res.json({ summaries: [], message: 'Нет статей за выбранный период' });
    return;
  }

  const filtered = sourceIds.length ? articles.filter((a: any) => sourceIds.includes(a.source)) : articles;
  const bySource: Record<string, { name: string; articles: typeof articles }> = {};
  for (const a of filtered) {
    if (!bySource[a.source]) bySource[a.source] = { name: a.sourceName, articles: [] };
    bySource[a.source].articles.push(a);
  }

  const summaries: any[] = [];
  for (const [sourceId, group] of Object.entries(bySource)) {
    try {
      group.articles.sort((a: any, b: any) => b.publishedAt.localeCompare(a.publishedAt));
      const text = group.articles.map((a: any, i: number) => `${i + 1}. ${a.title}\n${a.bodyText.slice(0, 600).trim()}`).join('\n\n');
      const prompt = `Сводка по "${group.name}" за ${daysBack} дн. (${group.articles.length} новостей). Объём: до ${maxLength} слов.\n\n${text.slice(0, 10000)}`;
      const summary = await callDeepSeek(SUMMARIZE_SOURCES_PROMPT, prompt);
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary });
    } catch (err: any) {
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary: '', error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  res.json({ summaries });
});

export default router;
