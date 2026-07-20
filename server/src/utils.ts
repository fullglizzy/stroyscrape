// ============================================================
// Утилиты: парсинг дат, очистка текста, HTTP
// ============================================================

import { createHash } from 'node:crypto';

/**
 * Парсит русскую дату в ISO 8601.
 * Поддерживает форматы:
 *   "20.07.2026"
 *   "20 июля 2026 14:32"
 *   "20 июл. 2026 г. 14:30"
 *   "2026-07-20T11:10:00+03:00" (уже ISO)
 */
export function parseRussianDate(raw: string): string {
  const trimmed = raw.trim();

  // Уже ISO 8601
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed;
  }

  // "DD.MM.YYYY"
  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m}-${d}T00:00:00+03:00`;
  }

  // Русские месяцы: "20 июля 2026 14:32" или "20 июл. 2026 г. 14:30"
  const ruMonths: Record<string, string> = {
    'января': '01', 'янв': '01',
    'февраля': '02', 'фев': '02',
    'марта': '03', 'мар': '03',
    'апреля': '04', 'апр': '04',
    'мая': '05', 'май': '05',
    'июня': '06', 'июн': '06',
    'июля': '07', 'июл': '07',
    'августа': '08', 'авг': '08',
    'сентября': '09', 'сен': '09',
    'октября': '10', 'окт': '10',
    'ноября': '11', 'ноя': '11',
    'декабря': '12', 'дек': '12',
  };

  const ruMatch = trimmed.match(
    /^(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв\.?|фев\.?|мар\.?|апр\.?|мая|июн\.?|июл\.?|авг\.?|сен\.?|окт\.?|ноя\.?|дек\.?)\s*(\d{4})(?:\s*г\.?)?(?:\s*(\d{1,2}):(\d{2}))?/i
  );

  if (ruMatch) {
    const [, d, monthName, y, hh = '00', mm = '00'] = ruMatch;
    const m = ruMonths[monthName.toLowerCase().replace(/\.$/, '')] || '01';
    return `${y}-${m}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`;
  }

  // Fallback: вернуть как есть
  return trimmed;
}

/**
 * Очищает HTML от тегов, нормализует пробелы.
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map(s => s.trim())
    .join('\n')
    .trim();
}

/**
 * Извлекает ID статьи из URL.
 * stroygaz: /news/12345-title → 12345
 * ancb: /news/read/21927 → 21927
 * Если чисел нет или меньше 3 цифр — хеш от URL
 */
export function extractArticleId(url: string): string {
  // Ищем ПОСЛЕДНИЙ сегмент URL: всё после последнего /
  const lastSegment = url.split('/').pop() || '';
  // Пробуем извлечь число из последнего сегмента (например "12345-title" → 12345)
  const numMatch = lastSegment.match(/^(\d+)/);
  if (numMatch && numMatch[1].length >= 3) return numMatch[1];
  // Также ищем число в предпоследнем сегменте (например /read/21927/)
  const segments = url.split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = segments[i].match(/^(\d+)$/);
    if (m && m[1].length >= 3) return m[1];
  }
  // Fallback: короткий хеш от полного URL
  return createHash('md5').update(url).digest('base64url').slice(0, 12);
}

/**
 * Генерирует уникальный ID статьи: "source:articleId"
 */
export function makeArticleId(source: string, url: string): string {
  return `${source}:${extractArticleId(url)}`;
}

/**
 * Задержка (sleep)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
