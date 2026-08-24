import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('C:/Users/osaka/Downloads/stroyscrape.db', { readOnly: true });
const q = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

// 1. Статьи и классификация
const total = q('SELECT COUNT(*) c FROM articles').c;
const uncl = q("SELECT COUNT(*) c FROM articles WHERE classification = '[]'").c;
const energy = q('SELECT COUNT(*) c FROM articles WHERE classification LIKE ?', '%"energy"%').c;
const digital = q('SELECT COUNT(*) c FROM articles WHERE classification LIKE ?', '%"digital"%').c;
const dc = q('SELECT COUNT(*) c FROM articles WHERE classification LIKE ?', '%"datacenters"%').c;
const multi = q("SELECT COUNT(*) c FROM articles WHERE classification NOT IN ('[]','') AND classification LIKE '%,%'").c;
console.log('=== СТАТЬИ ===');
console.log(JSON.stringify({ total, classified: total - uncl, unclassified: uncl, energy, digital, datacenters, multi_domain: multi }, null, 2));

// 2. Отчёты
const repCount = q('SELECT COUNT(*) c FROM analytics_reports').c;
console.log('=== ОТЧЁТЫ ===');
console.log('всего:', repCount);
const reps = all('SELECT id, domain, title, article_count, created_at, length(content) content_len FROM analytics_reports ORDER BY created_at DESC LIMIT 10');
for (const r of reps) console.log(`  #${r.id} [${r.domain}] ${r.title} | статей: ${r.article_count} | контент: ${r.content_len} симв. | ${r.created_at}`);
const legacy = q('SELECT COUNT(*) c FROM reports').c;
console.log('legacy reports:', legacy);

// 3. Проверка качества отчёта: разделы и ссылки
const latest = all('SELECT content FROM analytics_reports ORDER BY created_at DESC LIMIT 1');
if (latest.length) {
  const c = latest[0].content;
  const sections = (c.match(/^## .+$/gm) || []).map(s => s.replace('## ', ''));
  const links = (c.match(/\[\[(\d+)\]\]\([^)]+\)/g) || []).length;
  const srcBlock = c.includes('## Источники');
  console.log('=== ПОСЛЕДНИЙ ОТЧЁТ ===');
  console.log('разделы:', sections.length, sections.join(' | '));
  console.log('кликабельных ссылок [N]:', links, '| блок Источники:', srcBlock);
}

// 4. Статус и ошибки
console.log('=== СТАТУС ===');
console.log(JSON.stringify(q('SELECT running, done_sources, total_sources, current_step, last_run FROM scrape_status'), null, 2));
const errs = all('SELECT source, message FROM scrape_errors ORDER BY timestamp DESC LIMIT 5');
console.log('ошибок парсинга:', errs.length, errs.map(e => `${e.source}: ${e.message.slice(0, 60)}`).join(' | '));

// 5. Свежесть
const f = q('SELECT MIN(fetched_at) mn, MAX(fetched_at) mx FROM articles').get();
console.log('диапазон fetched_at:', f.mn, '→', f.mx);
