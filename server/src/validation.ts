/** Простая валидация query/body параметров */

export function validateInt(value: any, min: number, max: number, fallback: number): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < min) return fallback;
  if (n > max) return max;
  return n;
}

export function validateString(value: any, maxLen: number, fallback?: string): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value.slice(0, maxLen);
}

export function validateStringArray(value: any, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
    .slice(0, maxItems)
    .map((v: string) => v.slice(0, maxLen));
}

export function validateEnum<T extends string>(value: any, allowed: T[], fallback: T): T {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
  return fallback;
}
