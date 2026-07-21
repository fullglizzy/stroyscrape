/** Нормализация названий метрик: объединение схожих имён через расстояние Левенштейна */

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Группирует названия метрик: схожие (расстояние <= threshold) объединяются
 * Возвращает Map: каноническое имя → массив вариантов
 */
export function clusterMetricNames(names: string[], threshold = 3): Map<string, string[]> {
  const normalized = names.map(n => ({ original: n, norm: normalize(n) }));
  const clusters: Map<string, string[]> = new Map();
  const used = new Set<string>();

  for (const { original, norm } of normalized) {
    if (used.has(original)) continue;

    let found = false;
    for (const [canon, variants] of clusters) {
      const canonNorm = normalize(canon);
      if (levenshtein(norm, canonNorm) <= threshold || norm.includes(canonNorm) || canonNorm.includes(norm)) {
        variants.push(original);
        used.add(original);
        found = true;
        break;
      }
    }

    if (!found) {
      clusters.set(original, [original]);
      used.add(original);
    }
  }

  // Для каждого кластера выбираем самое короткое имя как каноническое
  const result = new Map<string, string[]>();
  for (const [_, variants] of clusters) {
    const canon = variants.reduce((a, b) => a.length <= b.length ? a : b);
    result.set(canon, variants);
  }
  return result;
}
