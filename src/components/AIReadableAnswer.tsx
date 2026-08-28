import ReactMarkdown from "react-markdown";
import { CalendarDays, CircleDollarSign } from "lucide-react";
import {
  cleanAiCell,
  parseAiReadableContent,
  type AiTableBlock,
} from "@/lib/ai-readable-content";

export function AIReadableAnswer({ content }: { content: string }) {
  const blocks = parseAiReadableContent(content);

  return (
    <div className="space-y-5 text-[15px] leading-7 text-foreground sm:text-base">
      {blocks.map((block, index) =>
        block.type === "table" ? (
          <ReadableTable key={`table-${index}`} table={block} />
        ) : (
          <ReactMarkdown
            key={`markdown-${index}`}
            components={{
              h2: ({ children }) => (
                <h2 className="mt-7 border-b border-border/60 pb-2 font-display text-xl font-bold tracking-tight first:mt-0 sm:text-2xl">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-5 font-display text-lg font-bold tracking-tight sm:text-xl">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="my-3 text-[15px] leading-7 text-foreground/90 sm:text-base sm:leading-7">
                  {children}
                </p>
              ),
              ul: ({ children }) => <ul className="my-3 space-y-2 pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="my-3 space-y-2 pl-5">{children}</ol>,
              li: ({ children }) => <li className="pl-1 leading-7 marker:text-primary">{children}</li>,
              strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
              blockquote: ({ children }) => (
                <blockquote className="my-4 rounded-r-2xl border-l-4 border-primary/50 bg-primary/[0.06] px-4 py-2 text-foreground/85">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-6 border-border/60" />,
            }}
          >
            {block.content}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
}

function normalizeHeader(value: string) {
  return cleanAiCell(value).toLocaleLowerCase("fr-FR");
}

function ReadableTable({ table }: { table: AiTableBlock }) {
  const normalized = table.headers.map(normalizeHeader);
  const isBudgetTable =
    normalized.some((header) => header.includes("date")) &&
    normalized.some((header) => /montant|budget|prix|coût|cout/.test(header));

  if (isBudgetTable) return <BudgetTable table={table} />;
  return <ComparisonCards table={table} />;
}

function BudgetTable({ table }: { table: AiTableBlock }) {
  const normalized = table.headers.map(normalizeHeader);
  const dateIndex = Math.max(0, normalized.findIndex((header) => header.includes("date")));
  const categoryIndex = normalized.findIndex((header) => /catégorie|categorie|poste|type/.test(header));
  const amountIndex = normalized.findIndex((header) => /montant|budget|prix|coût|cout/.test(header));
  const detailIndex = normalized.findIndex((header) => /détail|detail|description|note/.test(header));

  const grouped = new Map<string, string[][]>();
  for (const row of table.rows) {
    const key = cleanAiCell(row[dateIndex] || "À prévoir");
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return (
    <div className="my-5 space-y-3">
      {[...grouped.entries()].map(([date, rows]) => (
        <section key={date} className="overflow-hidden rounded-2xl border border-border/70 bg-background/50 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/35 px-4 py-3">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-bold">{formatDateLabel(date)}</h3>
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((row, rowIndex) => (
              <div key={`${date}-${rowIndex}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">
                    {cleanAiCell(row[categoryIndex >= 0 ? categoryIndex : dateIndex + 1] || "Dépense")}
                  </div>
                  {detailIndex >= 0 && row[detailIndex] ? (
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">
                      {cleanAiCell(row[detailIndex])}
                    </div>
                  ) : null}
                </div>
                {amountIndex >= 0 && row[amountIndex] ? (
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                    <CircleDollarSign className="h-3.5 w-3.5" />
                    {cleanAiCell(row[amountIndex])}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ComparisonCards({ table }: { table: AiTableBlock }) {
  const normalized = table.headers.map(normalizeHeader);
  const titleIndex = Math.max(
    0,
    normalized.findIndex((header) => /option|hébergement|hebergement|choix|nom|date/.test(header)),
  );

  return (
    <div className="my-5 grid gap-3 sm:grid-cols-2">
      {table.rows.map((row, rowIndex) => {
        const title = cleanAiCell(row[titleIndex] || `Option ${rowIndex + 1}`);
        return (
          <article key={`${title}-${rowIndex}`} className="rounded-2xl border border-border/70 bg-background/55 p-4 shadow-sm">
            <h3 className="font-display text-base font-bold leading-snug sm:text-lg">{title}</h3>
            <dl className="mt-3 space-y-3">
              {table.headers.map((header, cellIndex) => {
                if (cellIndex === titleIndex || !row[cellIndex]) return null;
                const label = cleanAiCell(header);
                const value = cleanAiCell(row[cellIndex]);
                const important = /budget|prix|coût|cout|verdict|total/.test(normalizeHeader(header));
                return (
                  <div key={`${label}-${cellIndex}`} className="grid gap-0.5">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className={important ? "font-semibold leading-6 text-primary" : "leading-6 text-foreground/90"}>
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
