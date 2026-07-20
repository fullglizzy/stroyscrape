// ============================================================
// AI Суммаризация через DeepSeek API
// Суммаризация по источникам с выбором периода
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles } from '../scraper/output.js';

const router = Router();

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `Ты — профессиональный аналитик строительной отрасли России.
Твоя задача — сделать аналитическую сводку по новостям из указанного источника за заданный период.
Формат ответа (строго соблюдай):
1. **Общая картина** (2-3 предложения: главные тренды и события периода)
2. **Ключевые события** (каждое — заголовок + 1-2 предложения сути, не более 5 событий)
3. **Выводы и значимость для отрасли** (2-3 предложения)

Используй только информацию из предоставленных новостей. Не выдумывай факты.`;

interface SummarizeSourcesRequest {
  apiKey: string;
  sourceIds?: string[];
  daysBack: number;
  maxLength?: number;
}

async function callDeepSeek(apiKey: string, prompt: string, maxTokens: number = 1500): Promise<string> {
  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// POST /api/summarize/sources — сводка по источникам за период
router.post('/summarize/sources', async (req: Request, res: Response) => {
  const { apiKey, sourceIds, daysBack, maxLength } = req.body as SummarizeSourcesRequest;

  if (!apiKey) {
    res.status(400).json({ error: 'apiKey обязателен' });
    return;
  }
  if (!daysBack || daysBack < 1) {
    res.status(400).json({ error: 'daysBack должен быть >= 1' });
    return;
  }

  const allArticles = readArticles();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  // Фильтруем по дате и источникам
  const filtered = allArticles.filter(a => {
    const pubDate = new Date(a.publishedAt);
    if (isNaN(pubDate.getTime())) return false;
    if (pubDate < cutoff) return false;
    if (sourceIds && sourceIds.length > 0 && !sourceIds.includes(a.source)) return false;
    return true;
  });

  if (filtered.length === 0) {
    res.json({
      summaries: [],
      message: 'Нет статей за выбранный период',
    });
    return;
  }

  // Группируем по источникам
  const bySource: Record<string, { name: string; articles: typeof filtered }> = {};
  for (const a of filtered) {
    if (!bySource[a.source]) {
      bySource[a.source] = { name: a.sourceName, articles: [] };
    }
    bySource[a.source].articles.push(a);
  }

  const now = new Date().toISOString();
  const dateRange = {
    from: cutoff.toISOString().slice(0, 10),
    to: now.slice(0, 10),
  };

  const summaries: {
    sourceId: string;
    sourceName: string;
    articleCount: number;
    dateRange: { from: string; to: string };
    summary: string;
    error?: string;
  }[] = [];

  // Суммаризируем каждый источник
  for (const [sourceId, group] of Object.entries(bySource)) {
    try {
      // Сортируем от свежих к старым
      group.articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      // Формируем текст: заголовки + первые 600 символов каждой статьи
      const articlesText = group.articles
        .map((a, i) => `${i + 1}. ${a.title}\n${a.bodyText.slice(0, 600).trim()}`)
        .join('\n\n');

      const wordLimit = maxLength || 400;
      const prompt = `Сделай аналитическую сводку по новостям источника "${group.name}" за период с ${dateRange.from} по ${dateRange.to} (${group.articles.length} новостей).\n\nОбъём сводки — не более ${wordLimit} слов.\n\nНОВОСТИ:\n\n${articlesText.slice(0, 8000)}`;

      const summary = await callDeepSeek(apiKey, prompt, Math.min(wordLimit * 3, 2500));

      summaries.push({
        sourceId,
        sourceName: group.name,
        articleCount: group.articles.length,
        dateRange,
        summary,
      });
    } catch (err: any) {
      summaries.push({
        sourceId,
        sourceName: group.name,
        articleCount: group.articles.length,
        dateRange,
        summary: '',
        error: err.message,
      });
    }

    // Задержка между запросами
    await new Promise(r => setTimeout(r, 1000));
  }

  res.json({ summaries });
});

export default router;
