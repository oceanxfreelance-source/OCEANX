import { Fragment } from "react";

/**
 * Minimal, safe markdown renderer for admin-authored policy pages
 * (headings, paragraphs, bullet lists, **bold**). Output is React elements — no raw HTML.
 */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="prose-lite">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith("# ")) return <h1 key={i}>{inline(t.slice(2))}</h1>;
        if (t.startsWith("## ")) return <h2 key={i}>{inline(t.slice(3))}</h2>;
        if (t.split("\n").every((l) => /^[-*] /.test(l.trim())))
          return (
            <ul key={i}>
              {t.split("\n").map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}
