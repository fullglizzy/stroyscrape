// ============================================================
// AI Суммаризация через DeepSeek API
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles } from '../scraper/output.js';

const router = Router();

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const SYSTEM_PROMPT = `Ты — профессиональный аналитик строительной отрасли России. 
Суммаризируй новость на русском языке. Формат ответа:
1. Заголовок (краткий, 5-10 слов)
2. Ключевые факты (3-5 пунктов)
3. Вывод/значимость для отрасли (1-2 предложения)
Используй только информацию из текста новости. Не добавляй свои знания.`;

interface SummarizeRequest {
  text: string;
  apiKey: string;
  maxLength?: number;
}

interface BatchSummarizeRequest {
  articleIds: string[];
  apiKey: string;
  maxLength?: number;
}

async function callDeepSeek(apiKey: string, text: string, maxLength: number = 300): Promise<string> {
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
        { role: 'user', content: `Суммаризируй следующую новость (не более ${maxLength} слов):\n\n${text}` },
      ],
      max_tokens: Math.min(maxLength * 3, 2000),
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || 'Не удалось получить саммари';
}

// POST /api/summarize — суммаризация одного текста
router.post('/summarize', async (req: Request, res: Response) => {
  const { text, apiKey, maxLength } = req.body as SummarizeRequest;

  if (!text || !apiKey) {
    res.status(400).json({ error: 'text и apiKey обязательны' });
    return;
  }

  try {
    const summary = await callDeepSeek(apiKey, text, maxLength || 300);
    res.json({ summary });
  } catch (err: any) {
    console.error('Summarize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/summarize/batch — суммаризация нескольких статей по ID
router.post('/summarize/batch', async (req: Request, res: Response) => {
  const { articleIds, apiKey, maxLength } = req.body as BatchSummarizeRequest;

  if (!articleIds?.length || !apiKey) {
    res.status(400).json({ error: 'articleIds и apiKey обязательны' });
    return;
  }

  const articles = readArticles();
  const results: { id: string; title: string; summary: string; error?: string }[] = [];

  for (const id of articleIds) {
    const article = articles.find(a => a.id === id);
    if (!article) {
      results.push({ id, title: '?', summary: '', error: 'Статья не найдена' });
      continue;
    }

    try {
      // Ограничиваем текст для API (первые 4000 символов)
      const text = article.bodyText.slice(0, 4000);
      const summary = await callDeepSeek(apiKey, text, maxLength || 300);
      results.push({ id, title: article.title, summary });
    } catch (err: any) {
      results.push({ id, title: article.title, summary: '', error: err.message });
    }

    // Задержка между запросами чтобы не упереться в rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  res.json({ results });
});

export default router;
