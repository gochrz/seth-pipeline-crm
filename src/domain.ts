export const STAGES = [
  { id: "lead", name: "Lead", sub: "", tint: "#8A9791" },
  { id: "qualified", name: "Qualified", sub: "", tint: "#1F7A5A" },
  { id: "downsell", name: "Unqualified", sub: "downsell", tint: "#A8763E" },
  { id: "closed", name: "Closed", sub: "", tint: "#12603F" },
  { id: "lost", name: "Lost", sub: "", tint: "#9A2E2E" }
] as const;

export const CLOSERS = ["Ben", "Dylan", "Seth"] as const;

export const OFFERS = [
  { id: "core", label: "Core offer" },
  { id: "downsell", label: "Downsell" }
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type Closer = (typeof CLOSERS)[number] | "";
export type OfferId = (typeof OFFERS)[number]["id"] | "";

export type LeadNote = {
  ts: number;
  text: string;
  auto: boolean;
};

export type LeadRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: StageId;
  offer: OfferId;
  closer: Closer;
  value: number;
  lastMeeting: string;
  nextMeeting: string;
  nextStep: string;
  notes: LeadNote[];
  createdAt: number;
  updatedAt: number;
};

export type LeadDraft = Omit<
  LeadRecord,
  "stage" | "offer" | "closer" | "value"
> & {
  stage: string;
  offer: string;
  closer: string;
  value: number | string;
};

export type LeadStatus = {
  kind: "booked" | "overdue" | "unbooked" | "none";
  label: string;
  edge: string;
  rank: number;
  sortKey: number;
};

const textFields = [
  "name",
  "email",
  "phone",
  "source",
  "lastMeeting",
  "nextMeeting",
  "nextStep"
] as const;

function isStage(value: string): value is StageId {
  return STAGES.some((stage) => stage.id === value);
}

function isOffer(value: string): value is OfferId {
  return value === "" || OFFERS.some((offer) => offer.id === value);
}

function isCloser(value: string): value is Closer {
  return value === "" || CLOSERS.some((closer) => closer === value);
}

function numericValue(value: number | string): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error("Deal value must be a number");
  }
  if (parsed < 0) {
    throw new Error("Deal value must be zero or greater");
  }
  if (parsed > 100_000_000) {
    throw new Error("Deal value is too large");
  }
  return parsed;
}

export function normalizeLeadDraft(lead: LeadDraft): LeadRecord {
  if (!isStage(lead.stage)) {
    throw new Error("Unsupported stage");
  }
  if (!isOffer(lead.offer)) {
    throw new Error("Unsupported offer");
  }
  if (!isCloser(lead.closer)) {
    throw new Error("Unsupported closer");
  }

  const normalized = { ...lead } as LeadDraft;
  for (const field of textFields) {
    normalized[field] = lead[field].trim();
  }
  if (!normalized.name) {
    throw new Error("Give the lead a name first");
  }
  if (normalized.name.length > 120) {
    throw new Error("Lead name is too long");
  }
  if (normalized.email.length > 320) {
    throw new Error("Email is too long");
  }
  if (normalized.phone.length > 50) {
    throw new Error("Phone is too long");
  }
  if (normalized.source.length > 120) {
    throw new Error("Source is too long");
  }
  if (normalized.nextStep.length > 500) {
    throw new Error("Next step is too long");
  }
  if (normalized.notes.length > 100) {
    throw new Error("A lead can have at most 100 notes");
  }

  const notes = normalized.notes.map((note) => {
    const text = note.text.trim();
    if (!text) {
      throw new Error("Notes cannot be empty");
    }
    if (text.length > 4000) {
      throw new Error("Note is too long");
    }
    return { ...note, text };
  });

  return {
    ...normalized,
    stage: lead.stage,
    offer: lead.offer,
    closer: lead.closer,
    value: numericValue(lead.value),
    notes
  };
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMeetingInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = parseDate(value);
  if (!date) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMeeting(value: string): string {
  const date = parseDate(value);
  if (!date) {
    return "";
  }
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
  return `${day} · ${time}`;
}

function dayStart(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

function daysSince(value: string, now: Date): number | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return Math.max(0, Math.floor((dayStart(now) - dayStart(date)) / 86_400_000));
}

export function isOpenLead(lead: LeadRecord): boolean {
  return lead.stage !== "closed" && lead.stage !== "lost";
}

export function getLeadStatus(lead: LeadRecord, now: Date): LeadStatus {
  const timestamp = -lead.updatedAt;
  if (!isOpenLead(lead)) {
    return {
      kind: "none",
      label: "",
      edge: lead.stage === "closed" ? "#12603F" : "var(--line)",
      rank: 9,
      sortKey: timestamp
    };
  }

  const nextMeeting = parseDate(lead.nextMeeting);
  if (nextMeeting && nextMeeting >= now) {
    return {
      kind: "booked",
      label: formatMeeting(lead.nextMeeting),
      edge: "#101A15",
      rank: 3,
      sortKey: nextMeeting.getTime()
    };
  }
  if (nextMeeting && nextMeeting < now) {
    return {
      kind: "overdue",
      label: "overdue",
      edge: "#9A2E2E",
      rank: 0,
      sortKey: nextMeeting.getTime()
    };
  }

  const age = daysSince(lead.lastMeeting, now);
  if (age === null) {
    return {
      kind: "unbooked",
      label: "unbooked · new",
      edge: "#A8763E",
      rank: 1,
      sortKey: 0
    };
  }
  return {
    kind: "unbooked",
    label: `unbooked · ${age}d`,
    edge: "#A8763E",
    rank: 2,
    sortKey: -age
  };
}

export function formatMoney(value: number | string): string {
  const parsed = Number(value) || 0;
  if (!parsed) {
    return "";
  }
  return `$${parsed >= 1000 ? `${Math.round(parsed / 100) / 10}k` : parsed}`;
}

export function formatFullMoney(value: number | string): string {
  return `$${(Number(value) || 0).toLocaleString("en-US")}`;
}
