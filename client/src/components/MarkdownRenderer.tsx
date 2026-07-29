import { Fragment } from 'react';

/**
 * Лёгкий рендерер markdown-подобного текста из AI-ответов.
 * Поддерживает: **bold**, ### заголовки, нумерованные списки, - маркеры,
 * [текст](url) ссылки, [[N]](url) ссылки на источники.
 */
export default function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: { type: 'h2' | 'h3' | 'list-item' | 'bullet' | 'p'; content: string; number?: number }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      blocks.push({ type: 'h2', content: line.replace(/^#{1,3}\s+/, '') });
      i++;
      continue;
    }

    const boldHeaderMatch = line.match(/^\*\*(.+?):\*\*(.*)/);
    if (boldHeaderMatch) {
      blocks.push({ type: 'h3', content: boldHeaderMatch[1] });
      if (boldHeaderMatch[2].trim()) {
        blocks.push({ type: 'p', content: boldHeaderMatch[2].trim() });
      }
      i++;
      continue;
    }

    const boldOnlyMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (boldOnlyMatch && line.length < 100) {
      blocks.push({ type: 'h3', content: boldOnlyMatch[1] });
      i++;
      continue;
    }

    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      blocks.push({ type: 'list-item', content: numMatch[2], number: parseInt(numMatch[1]) });
      i++;
      continue;
    }

    const bulletMatch = line.match(/^[-•]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', content: bulletMatch[1] });
      i++;
      continue;
    }

    let paragraph = line;
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      paragraph += '\n' + lines[i].trim();
      i++;
    }
    blocks.push({ type: 'p', content: paragraph });
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h2':
            return (
              <h3 key={idx} className="text-base font-bold pb-1.5 mt-1" style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)' }}>
                {renderInline(block.content)}
              </h3>
            );

          case 'h3':
            return (
              <h4 key={idx} className="text-sm font-bold mt-2" style={{ color: 'var(--color-text)' }}>
                {renderInline(block.content)}
              </h4>
            );

          case 'list-item':
            return (
              <div key={idx} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                  style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                  {block.number}
                </span>
                <span className="text-sm leading-relaxed flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {renderInline(block.content)}
                </span>
              </div>
            );

          case 'bullet':
            return (
              <div key={idx} className="flex gap-2 items-start ml-2">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ background: 'var(--color-text-muted)' }} />
                <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {renderInline(block.content)}
                </span>
              </div>
            );

          case 'p':
            return (
              <p key={idx} className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {renderInline(block.content)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

/** Проверка: является ли строка началом специального блока */
function isSpecialLine(line: string): boolean {
  const t = line.trim();
  return /^#{1,3}\s/.test(t) ||
    /^\*\*.+?\*\*$/.test(t) ||
    /^\*\*.+?:\*\*/.test(t) ||
    /^\d+\.\s/.test(t) ||
    /^[-•]\s/.test(t);
}

// ============================================================
//  Инлайн-рендеринг: **bold**, [ссылка](url), [[N]](url)
// ============================================================

function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Шаг 1: заменяем [[N]](url) на метки-плейсхолдеры (чтобы не сломать парсинг обычных ссылок)
  const refs: { num: string; url: string }[] = [];
  let processed = text.replace(/\[\[(\d+)\]\]\(([^)]+)\)/g, (_, num: string, url: string) => {
    refs.push({ num, url });
    return `\u2060REF_${refs.length - 1}\u2060`; // word joiner — невидимый безопасный символ
  });

  // Шаг 2: парсим обычные [текст](url)
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(processed)) !== null) {
    if (m.index > cursor) {
      flushText(nodes, processed.slice(cursor, m.index), refs);
    }
    nodes.push(
      <a key={nodes.length} href={m[2]} target="_blank" rel="noopener noreferrer"
        className="underline hover:no-underline"
        style={{ color: 'var(--color-primary)' }}>
        {renderBold(m[1])}
      </a>
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < processed.length) {
    flushText(nodes, processed.slice(cursor), refs);
  }

  return nodes.length > 0 ? <>{nodes}</> : null;
}

/** Разбирает текстовый фрагмент: **bold** + метки REF_N → [N] */
function flushText(nodes: React.ReactNode[], raw: string, refs: { num: string; url: string }[]) {
  const parts = raw.split(/\u2060REF_(\d+)\u2060/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) nodes.push(<Fragment key={nodes.length}>{renderBold(parts[i])}</Fragment>);
    } else {
      const ref = refs[parseInt(parts[i])];
      if (ref) {
        nodes.push(
          <a key={nodes.length} href={ref.url} target="_blank" rel="noopener noreferrer"
            className="underline hover:no-underline font-medium"
            style={{ color: 'var(--color-primary)' }}>
            [{ref.num}]
          </a>
        );
      }
    }
  }
}

/** Рендерит **жирный текст** */
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold" style={{ color: 'var(--color-text)' }}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
