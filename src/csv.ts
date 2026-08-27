import {
  CLOSERS,
  STAGES,
  normalizeLeadDraft,
  type LeadDraft,
  type LeadRecord
} from "./domain";

export type CsvImportResult = {
  leads: LeadRecord[];
  skipped: number;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((candidate) =>
    candidate.some((candidateCell) => candidateCell.trim())
  );
}

export function importLeadsFromCsv(
  text: string,
  now: number,
  idFactory: () => string
): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { leads: [], skipped: 0 };
  }
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const leads: LeadRecord[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const get = (...keys: string[]): string => {
      for (const key of keys) {
        const index = header.indexOf(key);
        if (index >= 0) {
          return row[index]?.trim() ?? "";
        }
      }
      return "";
    };

    const name = get("name");
    if (!name) {
      skipped += 1;
      continue;
    }
    const stageRaw = get("stage").toLowerCase();
    const stage =
      STAGES.find(
        (candidate) =>
          candidate.id === stageRaw ||
          candidate.name.toLowerCase() === stageRaw ||
          (candidate.sub && stageRaw.includes(candidate.sub))
      )?.id ?? "lead";
    const offerRaw = get("offer").toLowerCase();
    const offer = offerRaw.includes("down")
      ? "downsell"
      : offerRaw.includes("core")
        ? "core"
        : stage === "downsell"
          ? "downsell"
          : "";
    const closerRaw = get("closer").toLowerCase();
    const closer =
      CLOSERS.find((candidate) => candidate.toLowerCase() === closerRaw) ?? "";
    const noteText = get("notes");
    const draft: LeadDraft = {
      id: idFactory(),
      name,
      email: get("email"),
      phone: get("phone"),
      source: get("source"),
      stage,
      offer,
      closer,
      value: get("value").replace(/[^0-9.-]/g, ""),
      nextMeeting: get("nextmeeting", "next meeting", "meeting scheduled"),
      lastMeeting: get("lastmeeting", "last meeting date", "last meeting"),
      nextStep: get("nextstep", "next step"),
      notes: noteText ? [{ ts: now, text: noteText, auto: false }] : [],
      createdAt: now,
      updatedAt: now
    };

    try {
      leads.push(normalizeLeadDraft(draft));
    } catch {
      skipped += 1;
    }
  }

  return { leads, skipped };
}

const columns = [
  "name",
  "stage",
  "offer",
  "closer",
  "value",
  "nextMeeting",
  "lastMeeting",
  "nextStep",
  "email",
  "phone",
  "source",
  "notes"
] as const;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeLeadsToCsv(leads: LeadRecord[]): string {
  const rows = [columns.join(",")];
  for (const lead of leads) {
    const notes = lead.notes
      .map((note) => {
        const date = new Date(note.ts);
        const prefix = Number.isNaN(date.getTime())
          ? ""
          : `${date.toISOString().slice(0, 10)}: `;
        return `${prefix}${note.text}`;
      })
      .join(" | ");
    rows.push(
      columns
        .map((column) => csvCell(column === "notes" ? notes : lead[column]))
        .join(",")
    );
  }
  return rows.join("\n");
}
