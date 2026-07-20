import { Fragment } from 'react';

/**
 * Лёгкий рендерер markdown-подобного текста из AI-ответов.
 * Поддерживает: **bold**, ### заголовки, нумерованные списки, - маркеры.
 */
export default function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: { type: 'h2' | 'h3' | 'list-item' | 'bullet' | 'p'; content: string; number?: number }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Пустая строка — разделитель
    if (!line) {
      i++;
      continue;
    }

    // ### Заголовок или **Заголовок:**
    if (/^#{1,3}\s/.test(line)) {
      blocks.push({ type: 'h2', content: line.replace(/^#{1,3}\s+/, '') });
      i++;
      continue;
    }

    // **Заголовок:** жирный текст в начале строки с двоеточием
    const boldHeaderMatch = line.match(/^\*\*(.+?):\*\*(.*)/);
    if (boldHeaderMatch) {
      blocks.push({ type: 'h3', content: boldHeaderMatch[1] });
      if (boldHeaderMatch[2].trim()) {
        blocks.push({ type: 'p', content: boldHeaderMatch[2].trim() });
      }
      i++;
      continue;
    }

    // **Заголовок** (без двоеточия, отдельная строка)
    const boldOnlyMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (boldOnlyMatch && line.length < 100) {
      blocks.push({ type: 'h3', content: boldOnlyMatch[1] });
      i++;
      continue;
    }

    // Нумерованный список: "1. текст"
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      blocks.push({ type: 'list-item', content: numMatch[2], number: parseInt(numMatch[1]) });
      i++;
      continue;
    }

    // Маркированный список: "- текст" или "• текст"
    const bulletMatch = line.match(/^[-•]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', content: bulletMatch[1] });
      i++;
      continue;
    }

    // Обычный текст — собираем до пустой строки
    let paragraph = line;
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      paragraph += '\n' + lines[i].trim();
      i++;
    }
    blocks.push({ type: 'p', content: paragraph });
  }

  // Рендерим блоки
  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h2':
            return (
              <h3 key={idx} className="text-base font-bold pb-1.5 mt-1" style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)' }}>
                {renderBold(block.content)}
              </h3>
            );

          case 'h3':
            return (
              <h4 key={idx} className="text-sm font-bold mt-2" style={{ color: 'var(--color-text)' }}>
                {renderBold(block.content)}
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
                  {renderBold(block.content)}
                </span>
              </div>
            );

          case 'bullet':
            return (
              <div key={idx} className="flex gap-2 items-start ml-2">
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ background: 'var(--color-text-muted)' }} />
                <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {renderBold(block.content)}
                </span>
              </div>
            );

          case 'p':
            return (
              <p key={idx} className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {renderBold(block.content)}
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

/** Рендерит **жирный текст** внутри строки */
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold" style={{ color: 'var(--color-text)' }}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
