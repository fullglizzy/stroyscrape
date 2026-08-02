// ============================================================
// AI-классификатор статей по доменам (energy/digital/datacenters)
// Заменяет эвристику на ключевых словах
// ============================================================

import { getUnclassifiedArticles, updateArticleClassification } from './db.js';
import { ArticleDomain } from './types.js';
import { logger } from './logger.js';

const DEEPSEEK_API = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/chat/completions';
const BATCH_SIZE = 30;          // статей за один запрос
const MAX_BODY_PREVIEW = 300;   // символов текста для классификации
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;

/** Модель для классификации (лёгкая задача — хватит стандартной) */
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'deepseek-chat';

const VALID_DOMAINS: ArticleDomain[] = ['energy', 'digital', 'datacenters'];

// ==================== Системный промпт ====================

const CLASSIFIER_PROMPT = `Ты — классификатор новостей строительной отрасли России. Твоя задача — определить, к каким тематическим доменам относится каждая новость.

ТРИ ДОМЕНА:
- energy — Энергетика: электросети, ТЭЦ, ГЭС, АЭС, подстанции, теплоснабжение, газификация, ВИЭ, энерготарифы, энергомощности, Минэнерго, Россети
- digital — Цифровизация строительства: ТИМ/BIM, цифровые двойники, ИИ в стройке, дроны, 3D-печать, роботизация, цифровой надзор, импортозамещение ПО, умный город
- datacenters — ЦОД и IT-инфраструктура: дата-центры, серверные стойки, облачные провайдеры, colocation, вычислительные мощности, GPU-фермы, строительство ЦОД, энергоснабжение ЦОД, рынок ЦОД

ПРАВИЛА:
1. Одна статья может относиться к НЕСКОЛЬКИМ доменам (например, строительство ЦОД с энергоснабжением = ["datacenters","energy"]).
2. Если статья ЯВНО не относится ни к одному домену — НЕ включай её в ответ.
3. Если сомневаешься — лучше пропусти. Ложные срабатывания хуже пропусков.
4. Не выдумывай домены — только из списка выше.

ФОРМАТ ОТВЕТА — только JSON, без markdown, без пояснений:
{
  "id_статьи": ["datacenters"],
  "id_другой_статьи": ["energy", "digital"]
}`;

// ==================== Helpers ====================

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY не задан в .env');
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateDomains(raw: any): ArticleDomain[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d: any) => VALID_DOMAINS.includes(d as ArticleDomain)) as ArticleDomain[];
}

// ==================== Вызов DeepSeek ====================

async function callDeepSeekClassify(
  apiKey: string,
  articles: { id: string; title: string; bodyText: string }[],
  attempt: number = 1
): Promise<Record<string, ArticleDomain[]>> {
  // Формируем компактный текст: только id + заголовок + первые 300 символов
  const lines = articles.map((a, i) =>
    `${i + 1}. [id:${a.id}] ${a.title}\n   ${(a.bodyText || '').slice(0, MAX_BODY_PREVIEW).replace(/\n/g, ' ').trim()}`
  );
  const userPrompt = `Классифицируй следующие ${articles.length} новостей:\n\n${lines.join('\n\n')}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: 'system', content: CLASSIFIER_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.0,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`DeepSeek API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const raw = data.choices?.[0]?.message?.content || '';

    // Извлекаем JSON из ответа (модель может обернуть в ```json ... ```)
    let jsonStr = raw.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Иногда модель возвращает JSON с комментариями или без кавычек — пробуем очистить
      const cleaned = jsonStr
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      try {
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        throw new Error(`Невалидный JSON от классификатора: ${jsonStr.slice(0, 300)}`);
      }
    }

    // Валидируем и нормализуем
    const result: Record<string, ArticleDomain[]> = {};
    for (const [id, domains] of Object.entries(parsed)) {
      const valid = validateDomains(domains);
      if (valid.length > 0) {
        result[id] = valid;
      }
    }

    return result;
  } catch (err: any) {
    clearTimeout(timeout);

    if (err.name === 'AbortError') {
      throw new Error('DeepSeek API: превышен таймаут (60с)');
    }

    // Retry с exponential backoff
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.warn(`[classifier] Повторная попытка ${attempt + 1}/${MAX_RETRIES} через ${delay}мс: ${err.message}`);
      await sleep(delay);
      return callDeepSeekClassify(apiKey, articles, attempt + 1);
    }

    throw err;
  }
}

// ==================== Публичная функция ====================

export interface ClassifyResult {
  total: number;         // всего обработано
  classified: number;    // получили хотя бы один домен
  errors: number;        // ошибок API
  details: { id: string; domains: ArticleDomain[] }[];
}

/**
 * Классифицировать все неразмеченные статьи.
 * @param daysBack — фильтр по дате (если не указан — все неклассифицированные)
 */
export async function classifyUnclassifiedArticles(daysBack?: number): Promise<ClassifyResult> {
  const apiKey = getApiKey();
  const unclassified = getUnclassifiedArticles(500, daysBack);

  if (unclassified.length === 0) {
    logger.info('[classifier] Нет неклассифицированных статей');
    return { total: 0, classified: 0, errors: 0, details: [] };
  }

  logger.info(`[classifier] Найдено ${unclassified.length} неклассифицированных статей`);

  const result: ClassifyResult = { total: unclassified.length, classified: 0, errors: 0, details: [] };

  // Обрабатываем батчами
  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    const batch = unclassified.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(unclassified.length / BATCH_SIZE);
    logger.info(`[classifier] Батч ${batchNum}/${totalBatches} (${batch.length} ст.)...`);

    try {
      const classified = await callDeepSeekClassify(apiKey, batch);

      // Обновляем БД
      let batchClassified = 0;
      for (const article of batch) {
        const domains = classified[article.id];
        if (domains && domains.length > 0) {
          updateArticleClassification(article.id, domains);
          result.details.push({ id: article.id, domains });
          batchClassified++;
        } else {
          // Статья не подошла ни под один домен — помечаем как просмотренную (оставляем [])
          // Ничего не делаем — classification уже '[]' по умолчанию
        }
      }

      result.classified += batchClassified;
      logger.info(`[classifier] Батч ${batchNum}: размечено ${batchClassified}/${batch.length}`);

    } catch (err: any) {
      result.errors++;
      logger.error(`[classifier] Ошибка батча ${batchNum}: ${err.message}`);
    }

    // Задержка между батчами чтобы не упереться в rate limit
    if (i + BATCH_SIZE < unclassified.length) {
      await sleep(1500);
    }
  }

  logger.info(`[classifier] Готово: ${result.classified}/${result.total} размечено, ${result.errors} ошибок`);
  return result;
}
