import { describe, expect, it } from "vitest";
import { importLeadsFromCsv, parseCsv, serializeLeadsToCsv } from "./csv";
import type { LeadRecord } from "./domain";

describe("parseCsv", () => {
  it("parses commas, escaped quotes, and line breaks inside quoted cells", () => {
    const rows = parseCsv(
      'name,notes\n"Ada, LLC","Said ""yes""\non the call"\n'
    );

    expect(rows).toEqual([
      ["name", "notes"],
      ["Ada, LLC", 'Said "yes"\non the call']
    ]);
  });
});

describe("importLeadsFromCsv", () => {
  it("maps the existing CSV columns into normalized leads", () => {
    const result = importLeadsFromCsv(
      [
        "name,stage,offer,closer,value,next meeting,last meeting,next step,email,phone,source,notes",
        '"Ada Lovelace",Qualified,Core,Ben,"$12,500",2026-09-01T10:00,2026-08-20,Send proposal,ada@example.com,555-0100,Referral,"Strong fit"'
      ].join("\n"),
      1_700_000_000_000,
      () => "lead-imported"
    );

    expect(result.skipped).toBe(0);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      id: "lead-imported",
      name: "Ada Lovelace",
      stage: "qualified",
      offer: "core",
      closer: "Ben",
      value: 12500,
      nextMeeting: "2026-09-01T10:00",
      lastMeeting: "2026-08-20",
      nextStep: "Send proposal",
      email: "ada@example.com",
      phone: "555-0100",
      source: "Referral",
      notes: [
        { ts: 1_700_000_000_000, text: "Strong fit", auto: false }
      ]
    });
  });

  it("maps an unqualified row to the downsell stage and offer", () => {
    const result = importLeadsFromCsv(
      "name,stage,offer,closer\nGrace Hopper,Unqualified,Downsell,dylan",
      1_700_000_000_000,
      () => "lead-2"
    );

    expect(result.leads[0]).toMatchObject({
      stage: "downsell",
      offer: "downsell",
      closer: "Dylan"
    });
  });

  it("skips rows without a name", () => {
    const result = importLeadsFromCsv(
      "name,email\n,missing@example.com\nAda,ada@example.com",
      1_700_000_000_000,
      () => "lead-3"
    );

    expect(result.leads).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});

describe("serializeLeadsToCsv", () => {
  it("exports the current lead fields and safely quotes notes", () => {
    const lead: LeadRecord = {
      id: "lead-1",
      name: "Ada, LLC",
      email: "ada@example.com",
      phone: "",
      source: "Referral",
      stage: "lead",
      offer: "core",
      closer: "Ben",
      value: 12500,
      nextMeeting: "",
      lastMeeting: "",
      nextStep: "Call again",
      notes: [
        { ts: Date.UTC(2026, 7, 27), text: 'Said "yes"', auto: false }
      ],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000
    };

    const csv = serializeLeadsToCsv([lead]);

    expect(csv.split("\n")[0]).toBe(
      "name,stage,offer,closer,value,nextMeeting,lastMeeting,nextStep,email,phone,source,notes"
    );
    expect(csv).toContain('"Ada, LLC"');
    expect(csv).toContain('"2026-08-27: Said ""yes"""');
  });
});
