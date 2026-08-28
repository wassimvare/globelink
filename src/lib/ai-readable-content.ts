export type AiMarkdownBlock = {
  type: "markdown";
  content: string;
};

export type AiTableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type AiReadableBlock = AiMarkdownBlock | AiTableBlock;

function splitPipeRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  const cells = splitPipeRow(line);
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function looksLikeTableHeader(line: string, nextLine: string | undefined) {
  return splitPipeRow(line).length >= 2 && !!nextLine && isSeparatorRow(nextLine);
}

export function parseAiReadableContent(content: string): AiReadableBlock[] {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: AiReadableBlock[] = [];
  let markdown: string[] = [];

  const flushMarkdown = () => {
    const text = markdown.join("\n").trim();
    if (text) blocks.push({ type: "markdown", content: text });
    markdown = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!looksLikeTableHeader(line, lines[index + 1])) {
      markdown.push(line);
      continue;
    }

    flushMarkdown();
    const headers = splitPipeRow(line);
    index += 2;
    const rows: string[][] = [];

    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      const cells = splitPipeRow(candidate);
      if (cells.length < 2 || !candidate.includes("|")) {
        index -= 1;
        break;
      }
      rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
      index += 1;
    }

    if (rows.length) blocks.push({ type: "table", headers, rows });
    else markdown.push(line);
  }

  flushMarkdown();
  return blocks;
}

export function cleanAiCell(value: string) {
  return String(value || "")
    .replace(/^\*\*(.*?)\*\*$/s, "$1")
    .replace(/^__(.*?)__$/s, "$1")
    .trim();
}
