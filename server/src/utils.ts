// ============================================================
// Утилиты: парсинг дат, очистка текста, HTTP
// ============================================================

import { createHash } from 'node:crypto';

/**
 * Парсит дату в ISO 8601.
 * Поддерживает форматы:
 *   "20.07.2026"
 *   "20 июля 2026 14:32"
 *   "20 июл. 2026 г. 14:30"
 *   "20 июля, понедельник" (без года — используется текущий)
 *   "2026-07-20T11:10:00+03:00" (уже ISO)
 *   "Mon, 20 Jul 2026 16:44:51 +0300" (RFC 2822)
 *   "Friday, July 31, 2026 at 4:34:00 PM" (англ. long-form)
 */
export function parseRussianDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString();

  // Уже ISO 8601 (с часовым поясом или без)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }

  // ISO дата без времени: "2026-07-20"
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}T00:00:00+03:00`;
  }

  // RFC 2822 (из RSS): "Mon, 20 Jul 2026 16:44:51 +0300"
  const rfcMatch = trimmed.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
  if (rfcMatch) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // "DD.MM.YYYY" или "D.M.YYYY"
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+03:00`;
  }

  // Русские месяцы
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

  // "20 июля, понедельник" — без года, используем текущий
  const noYearMatch = trimmed.match(
    /^(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв\.?|фев\.?|мар\.?|апр\.?|мая|июн\.?|июл\.?|авг\.?|сен\.?|окт\.?|ноя\.?|дек\.?)\s*,?\s*\S*/i
  );
  if (noYearMatch) {
    const [, d, monthName] = noYearMatch;
    const m = ruMonths[monthName.toLowerCase().replace(/\.$/, '')] || '01';
    const y = new Date().getFullYear();
    return `${y}-${m}-${String(d).padStart(2, '0')}T00:00:00+03:00`;
  }

  // "20 июля 2026 14:32" или "20 июл. 2026 г. 14:30"
  const ruMatch = trimmed.match(
    /^(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв\.?|фев\.?|мар\.?|апр\.?|мая|июн\.?|июл\.?|авг\.?|сен\.?|окт\.?|ноя\.?|дек\.?)\s*(\d{4})(?:\s*г\.?)?(?:\s*(\d{1,2})[.:](\d{2}))?/i
  );

  if (ruMatch) {
    const [, d, monthName, y, hh = '00', mm = '00'] = ruMatch;
    const m = ruMonths[monthName.toLowerCase().replace(/\.$/, '')] || '01';
    return `${y}-${m}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`;
  }

  // Английский long-form с "at": "Friday, July 31, 2026 at 4:34:00 PM"
  // Проблемный символ U+202F (NARROW NO-BREAK SPACE) перед PM/AM — нормализуем
  const enLongMatch = trimmed
    .replace(/ /g, ' ')
    .match(/^[A-Z][a-z]+,\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (enLongMatch) {
    const [, monthName, d, y, hh, mm, ss, ampm] = enLongMatch;
    const enMonths: Record<string, string> = {
      January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
      July:'07', August:'08', September:'09', October:'10', November:'11', December:'12',
    };
    const m = enMonths[monthName] || '01';
    let h = parseInt(hh, 10);
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${y}-${m}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+03:00`;
  }

  // Пробуем нативный парсинг как last resort
  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) return native.toISOString();

  // Fallback: логируем и возвращаем текущую дату
  console.warn(`[parseRussianDate] Не удалось разобрать дату: "${trimmed.slice(0, 80)}" — используется текущая`);
  return new Date().toISOString();
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
  if (numMatch && numMatch[1].length >= 3) {
    const num = numMatch[1];
    const afterNum = lastSegment.slice(num.length);
    // Если после числа идёт дефис + цифра — это дата-префикс (2026-07-29_slug),
    // а не ID статьи. Используем хеш.
    if (!/^-\d/.test(afterNum)) {
      return num;
    }
  }
  // Также ищем число в предпоследнем сегменте (например /read/21927/)
  const segments = url.split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = segments[i].match(/^(\d+)$/);
    if (m && m[1].length >= 5) return m[1];
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
