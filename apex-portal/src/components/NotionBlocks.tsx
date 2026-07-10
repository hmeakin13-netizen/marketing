import type { NotionBlockData, RichTextSegment } from "@/lib/types";

function RichText({ segments }: { segments: RichTextSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        let node: React.ReactNode = seg.text;
        if (seg.code) node = <code className="rounded bg-stone-100 px-1 py-0.5 text-[0.9em]">{node}</code>;
        if (seg.bold) node = <strong>{node}</strong>;
        if (seg.italic) node = <em>{node}</em>;
        if (seg.strikethrough) node = <s>{node}</s>;
        if (seg.underline) node = <span className="underline">{node}</span>;
        if (seg.href) {
          node = (
            <a href={seg.href} target="_blank" rel="noreferrer" className="text-forest-600 underline hover:text-forest-800">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

export function NotionBlocks({ blocks }: { blocks: NotionBlockData[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block) => {
        switch (block.type) {
          case "paragraph":
            return block.text.length ? (
              <p key={block.id} className="text-sm leading-relaxed text-forest-800">
                <RichText segments={block.text} />
              </p>
            ) : null;
          case "heading_1":
            return (
              <h3 key={block.id} className="text-base font-semibold text-forest-900">
                <RichText segments={block.text} />
              </h3>
            );
          case "heading_2":
            return (
              <h4 key={block.id} className="text-sm font-semibold text-forest-900">
                <RichText segments={block.text} />
              </h4>
            );
          case "heading_3":
            return (
              <h5 key={block.id} className="text-sm font-semibold text-forest-900">
                <RichText segments={block.text} />
              </h5>
            );
          case "bulleted_list_item":
            return (
              <ul key={block.id} className="list-disc pl-5 text-sm leading-relaxed text-forest-800">
                <li>
                  <RichText segments={block.text} />
                  {block.children.length ? <NotionBlocks blocks={block.children} /> : null}
                </li>
              </ul>
            );
          case "numbered_list_item":
            return (
              <ol key={block.id} className="list-decimal pl-5 text-sm leading-relaxed text-forest-800">
                <li>
                  <RichText segments={block.text} />
                  {block.children.length ? <NotionBlocks blocks={block.children} /> : null}
                </li>
              </ol>
            );
          case "to_do":
            return (
              <label key={block.id} className="flex items-start gap-2 text-sm text-forest-800">
                <input type="checkbox" checked={block.checked} readOnly className="mt-1 accent-forest-600" />
                <span className={block.checked ? "text-forest-400 line-through" : ""}>
                  <RichText segments={block.text} />
                </span>
              </label>
            );
          case "quote":
            return (
              <blockquote key={block.id} className="border-l-2 border-forest-300 pl-4 text-sm italic text-forest-700">
                <RichText segments={block.text} />
              </blockquote>
            );
          case "callout":
            return (
              <div key={block.id} className="flex gap-3 rounded-lg bg-stone-100 p-4 text-sm text-forest-800">
                {block.icon ? <span>{block.icon}</span> : null}
                <RichText segments={block.text} />
              </div>
            );
          case "divider":
            return <hr key={block.id} className="border-stone-200" />;
          case "image":
            // eslint-disable-next-line @next/next/no-img-element
            return (
              <figure key={block.id}>
                <img src={block.url} alt={block.caption || ""} className="rounded-lg" />
                {block.caption ? (
                  <figcaption className="mt-1 text-xs text-stone-500">{block.caption}</figcaption>
                ) : null}
              </figure>
            );
          case "code":
            return (
              <pre key={block.id} className="overflow-x-auto rounded-lg bg-forest-950 p-4 text-xs text-stone-100">
                <code>
                  <RichText segments={block.text} />
                </code>
              </pre>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
