/** Форматирует число в человеко-читаемый вид с разделителями разрядов */
export function formatNumber(n: number, decimals = 1): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(decimals).replace('.', ',') + ' млн';
  if (n >= 1_000) return n.toLocaleString('ru-RU');
  return n.toString();
}

/** Форматирует число + единицу измерения */
export function formatMetric(value: number, unit?: string): string {
  const num = value >= 10 ? Math.round(value).toLocaleString('ru-RU') : value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return unit ? `${num} ${unit}` : num;
}

/** Сокращает длинный текст */
export function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}
