// Renders the agent's plain-text replies: paragraphs, "-" bullets, **bold**. No HTML injection.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/^\*|\*$/g, ''),
  );
}

export default function Reply({ text, flags = [], streaming = false }) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blocks.push(null);
      continue;
    }
    const bullet = line.match(/^(?:[-•*]|\d+[.)]|[۰-۹]+[.)])\s+(.*)/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (last?.type === 'p') last.lines.push(line.replace(/^#+\s*/, ''));
    else blocks.push({ type: 'p', lines: [line.replace(/^#+\s*/, '')] });
  }

  return (
    <div className={`reply${streaming ? ' is-streaming' : ''}`}>
      {flags.includes('unverified_numbers') && <p className="reply-flag">بعضی شماره‌ها تأیید نشد و حذف شد.</p>}
      {flags.includes('unverified_action') && <p className="reply-flag">این پاسخ ادعای کاری را دارد که انجام نشده؛ به آن تکیه نکنید.</p>}
      {blocks.filter(Boolean).map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
