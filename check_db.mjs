import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

for (const p of ['C:/Users/osaka/Downloads/stroyscrape.db', 'C:/Users/osaka/Documents/Projects/stroyscrape/data/stroyscrape.db']) {
  if (!fs.existsSync(p)) { console.log(p, '=> НЕТ ФАЙЛА'); continue; }
  const st = fs.statSync(p);
  let out;
  try {
    const db = new DatabaseSync(p, { readOnly: true });
    const q = (sql) => db.prepare(sql).get();
    const total = q('SELECT COUNT(*) as c FROM articles').c;
    const uncl = q("SELECT COUNT(*) as c FROM articles WHERE classification = '[]'").c;
    const energy = q(`SELECT COUNT(*) as c FROM articles WHERE classification LIKE '%"energy"%'`).c;
    const digital = q(`SELECT COUNT(*) as c FROM articles WHERE classification LIKE '%"digital"%'`).c;
    const datacenters = q(`SELECT COUNT(*) as c FROM articles WHERE classification LIKE '%"datacenters"%'`).c;
    const reports = q('SELECT COUNT(*) as c FROM analytics_reports').c;
    const status = db.prepare('SELECT running, done_sources, total_sources, current_step, last_run, updated_at FROM scrape_status').get();
    const fetched = db.prepare('SELECT MIN(fetched_at) mn, MAX(fetched_at) mx FROM articles').get();
    out = { total, unclassified: uncl, classified: total - uncl, energy, digital, datacenters, reports, status, fetched };
  } catch (e) { out = { error: e.message }; }
  console.log(JSON.stringify({ path: p, sizeMB: (st.size / 1048576).toFixed(2), ...out }, null, 2));
}
