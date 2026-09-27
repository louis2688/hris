import { Fragment } from "react";
import { parseMarkdownLite, type MdInline } from "@hris/shared";

/** Safe renderer for the markdown subset: parsed into React elements, never raw HTML. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">
      {parseMarkdownLite(text).map((b, i) =>
        b.type === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Inline parts={l} />
              </Fragment>
            ))}
          </p>
        ) : (
          <List key={i} ordered={b.type === "ol"} items={b.items} />
        ),
      )}
    </div>
  );
}

function List({ ordered, items }: { ordered: boolean; items: MdInline[][] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-slate-400`}>
      {items.map((it, k) => (
        <li key={k}>
          <Inline parts={it} />
        </li>
      ))}
    </Tag>
  );
}

function Inline({ parts }: { parts: MdInline[] }) {
  return parts.map((p, k) =>
    p.t === "b" ? (
      <strong key={k} className="font-semibold text-ink">
        {p.v}
      </strong>
    ) : p.t === "a" ? (
      <a key={k} href={p.href} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800" {...(p.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
        {p.v}
      </a>
    ) : (
      <Fragment key={k}>{p.v}</Fragment>
    ),
  );
}
