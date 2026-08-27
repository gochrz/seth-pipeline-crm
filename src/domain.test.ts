import { describe, expect, it } from "vitest";
import {
  CLOSERS,
  OFFERS,
  STAGES,
  formatFullMoney,
  formatMoney,
  getLeadStatus,
  normalizeLeadDraft,
  type LeadRecord
} from "./domain";

const baseLead: LeadRecord = {
  id: "lead-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  source: "Referral",
  stage: "lead",
  offer: "core",
  closer: "Ben",
  value: 12000,
  lastMeeting: "",
  nextMeeting: "",
  nextStep: "Book discovery call",
  notes: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000
};

describe("pipeline constants", () => {
  it("preserves the existing stages, offers, and closers", () => {
    expect(STAGES.map((stage) => stage.id)).toEqual([
      "lead",
      "qualified",
      "downsell",
      "closed",
      "lost"
    ]);
    expect(OFFERS.map((offer) => offer.id)).toEqual(["core", "downsell"]);
    expect(CLOSERS).toEqual(["Ben", "Dylan", "Seth"]);
  });
});

describe("normalizeLeadDraft", () => {
  it("trims text and converts a currency value", () => {
    const normalized = normalizeLeadDraft({
      ...baseLead,
      name: "  Ada Lovelace  ",
      email: " ada@example.com ",
      value: "$12,500"
    });

    expect(normalized.name).toBe("Ada Lovelace");
    expect(normalized.email).toBe("ada@example.com");
    expect(normalized.value).toBe(12500);
  });

  it("rejects a lead without a name", () => {
    expect(() => normalizeLeadDraft({ ...baseLead, name: "   " })).toThrow(
      "Give the lead a name first"
    );
  });

  it("rejects unsupported pipeline values", () => {
    expect(() =>
      normalizeLeadDraft({ ...baseLead, stage: "waiting" })
    ).toThrow("Unsupported stage");
  });

  it("rejects negative deal values", () => {
    expect(() => normalizeLeadDraft({ ...baseLead, value: -1 })).toThrow(
      "Deal value must be zero or greater"
    );
  });
});

describe("lead status", () => {
  const now = new Date("2026-08-27T15:00:00.000Z");

  it("marks a future meeting as booked", () => {
    const result = getLeadStatus(
      { ...baseLead, nextMeeting: "2026-08-28T10:00" },
      now
    );

    expect(result.kind).toBe("booked");
    expect(result.label).toContain("Aug 28");
  });

  it("marks a past meeting as overdue", () => {
    const result = getLeadStatus(
      { ...baseLead, nextMeeting: "2026-08-26T10:00" },
      now
    );

    expect(result).toMatchObject({ kind: "overdue", label: "overdue" });
  });

  it("marks a lead without a next meeting as needing booking", () => {
    const result = getLeadStatus(
      { ...baseLead, lastMeeting: "2026-08-25" },
      now
    );

    expect(result).toMatchObject({ kind: "unbooked", label: "unbooked · 2d" });
  });

  it("does not flag closed leads", () => {
    const result = getLeadStatus(
      { ...baseLead, stage: "closed", nextMeeting: "2026-08-26T10:00" },
      now
    );

    expect(result.kind).toBe("none");
  });
});

describe("money formatting", () => {
  it("formats compact and full values", () => {
    expect(formatMoney(12500)).toBe("$12.5k");
    expect(formatFullMoney(12500)).toBe("$12,500");
    expect(formatMoney(0)).toBe("");
  });
});
