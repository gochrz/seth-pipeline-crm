import { describe, expect, it } from "vitest";
import type { LeadRecord } from "./domain";
import {
  emptyFilters,
  renderBoardMarkup,
  renderReadoutMarkup,
  visibleLeads
} from "./view";

const now = new Date("2026-08-27T15:00:00.000Z");

const lead = (changes: Partial<LeadRecord>): LeadRecord => ({
  id: "lead-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  source: "Referral",
  stage: "lead",
  offer: "core",
  closer: "Ben",
  value: 12500,
  lastMeeting: "",
  nextMeeting: "2026-08-28T10:00",
  nextStep: "Send proposal",
  notes: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...changes
});

describe("visibleLeads", () => {
  const leads = [
    lead({ id: "ada" }),
    lead({
      id: "grace",
      name: "Grace Hopper",
      closer: "Dylan",
      offer: "downsell",
      nextMeeting: "2026-08-26T10:00",
      notes: [{ ts: 1, text: "Needs a follow-up", auto: false }]
    })
  ];

  it("searches lead fields and notes", () => {
    const filters = emptyFilters();
    filters.q = "follow-up";

    expect(visibleLeads(leads, filters, now).map((item) => item.id)).toEqual([
      "grace"
    ]);
  });

  it("combines closer and offer filters", () => {
    const filters = emptyFilters();
    filters.closer.add("Dylan");
    filters.offer.add("downsell");

    expect(visibleLeads(leads, filters, now).map((item) => item.id)).toEqual([
      "grace"
    ]);
  });

  it("supports booked, unbooked, and overdue filters", () => {
    const booked = emptyFilters();
    booked.when.add("booked");
    expect(visibleLeads(leads, booked, now).map((item) => item.id)).toEqual([
      "ada"
    ]);

    const overdue = emptyFilters();
    overdue.when.add("overdue");
    expect(visibleLeads(leads, overdue, now).map((item) => item.id)).toEqual([
      "grace"
    ]);

    const unbooked = emptyFilters();
    unbooked.when.add("unbooked");
    expect(visibleLeads(leads, unbooked, now).map((item) => item.id)).toEqual([
      "grace"
    ]);
  });

  it("keeps completed leads out of meeting filters", () => {
    const filters = emptyFilters();
    filters.when.add("unbooked");

    expect(
      visibleLeads(
        [lead({ id: "closed", stage: "closed" }), lead({ id: "lost", stage: "lost" })],
        filters,
        now
      )
    ).toEqual([]);
  });
});

describe("pipeline markup", () => {
  it("renders stage columns and escapes customer data", () => {
    const html = renderBoardMarkup(
      [lead({ name: '<img src=x onerror="alert(1)">' })],
      emptyFilters(),
      now
    );

    expect(html).toContain("Lead");
    expect(html).toContain("Qualified");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("renders the existing pipeline totals", () => {
    const html = renderReadoutMarkup(
      [
        lead({ id: "open" }),
        lead({ id: "closed", stage: "closed", value: 5000 })
      ],
      emptyFilters(),
      now
    );

    expect(html).toContain("<b>1</b> open");
    expect(html).toContain("<b>1</b> booked");
    expect(html).toContain("<b>1</b> closed");
    expect(html).toContain("<b>$5,000</b>");
    expect(html.indexOf("booked")).toBeLessThan(html.indexOf("core"));
    expect(html).not.toContain("overdue</button>");
  });

  it("renders offer before closer on lead cards", () => {
    const html = renderBoardMarkup([lead({})], emptyFilters(), now);

    expect(html.indexOf("Core</span>")).toBeLessThan(html.indexOf("Ben</span>"));
  });
});
