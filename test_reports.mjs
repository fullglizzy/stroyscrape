import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const envRaw = fs.readFileSync('.env', 'utf-8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const key = env.DEEPSEEK_API_KEY;
const url = (env.DEEPSEEK_API_BASE || 'https://api.deepseek.com') + '/chat/completions';

// достаём REGION_CONTEXT и ENERGY_SYSTEM_PROMPT из исходников domainAnalytics.ts
const src = fs.readFileSync('server/src/routes/domainAnalytics.ts', 'utf-8');
const region = src.match(/const REGION_CONTEXT = `([\s\S]*?)`;/)[1];
const energyRaw = src.match(/export const ENERGY_SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
const systemPrompt = energyRaw.replace('${REGION_CONTEXT}', region);

// статьи: как в autoGenerateReports — первые 600 символов текста, до 20000 символов
const db = new DatabaseSync('C:/Users/osaka/Downloads/stroyscrape.db', { readOnly: true });
const rows = db.prepare('SELECT source_name, published_at, title, body_text FROM articles ORDER BY published_at DESC LIMIT 50').all();
const articlesText = rows.map((a, i) =>
  `${i + 1}. [${a.source_name}] ${(a.published_at || '').slice(0, 10)} — ${a.title}\n${(a.body_text || '').slice(0, 600).trim()}`
).join('\n\n');
const userPrompt = `Проанализируй следующие новости по тематике «Энергетика» за 7 дней (${rows.length} статей):\n\n${articlesText.slice(0, 20000)}`;

async function call(model, maxTokens, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: maxTokens, temperature: 0.3 }),
    });
    clearTimeout(t);
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    const u = data.usage || {};
    const content = msg.content || '';
    const sections = (content.match(/^## /gm) || []);
    console.log(JSON.stringify({
      model, maxTokens,
      status: res.status,
      finish: data.choices?.[0]?.finish_reason,
      seconds: ((Date.now() - start) / 1000).toFixed(1),
      contentLen: content.length,
      reasoningLen: (msg.reasoning_content || '').length,
      sections: sections.length,
      sectionNames: sections.map(s => s.slice(3)).join(' | ').slice(0, 200),
      promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens,
    }, null, 2));
    return content;
  } catch (e) {
    clearTimeout(t);
    console.log(JSON.stringify({ model, maxTokens, error: e.message }));
    return '';
  }
}

console.log('=== flash, max_tokens=16000, таймаут 240с ===');
const flashContent = await call('deepseek-v4-flash', 16000, 240000);
console.log('flash content preview:', flashContent.slice(0, 300).replace(/\n/g, ' '));

console.log('=== deepseek-chat, max_tokens=3500 (как в коде), таймаут 90с ===');
const chatContent = await call('deepseek-chat', 3500, 90000);
console.log('chat content preview:', chatContent.slice(0, 300).replace(/\n/g, ' '));
