import {
  STAGES,
  formatFullMoney,
  formatMoney,
  getLeadStatus,
  isOpenLead,
  type Closer,
  type LeadRecord,
  type OfferId
} from "./domain";

export type WhenFilter = "booked" | "unbooked" | "overdue";

export type Filters = {
  closer: Set<Closer>;
  offer: Set<OfferId>;
  when: Set<WhenFilter>;
  q: string;
};

export function emptyFilters(): Filters {
  return {
    closer: new Set(),
    offer: new Set(),
    when: new Set(),
    q: ""
  };
}

export function visibleLeads(
  leads: LeadRecord[],
  filters: Filters,
  now: Date
): LeadRecord[] {
  const query = filters.q.trim().toLowerCase();
  return leads.filter((lead) => {
    if (filters.closer.size > 0 && !filters.closer.has(lead.closer)) {
      return false;
    }
    if (filters.offer.size > 0 && !filters.offer.has(lead.offer)) {
      return false;
    }
    if (filters.when.size > 0) {
      if (!isOpenLead(lead)) {
        return false;
      }
      const status = getLeadStatus(lead, now);
      const matches =
        (filters.when.has("booked") && status.kind === "booked") ||
        (filters.when.has("overdue") && status.kind === "overdue") ||
        (filters.when.has("unbooked") && status.kind !== "booked");
      if (!matches) {
        return false;
      }
    }
    if (query) {
      const haystack = [
        lead.name,
        lead.nextStep,
        lead.email,
        lead.phone,
        lead.source,
        ...lead.notes.map((note) => note.text)
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function hasFilters(filters: Filters): boolean {
  return (
    filters.closer.size > 0 ||
    filters.offer.size > 0 ||
    filters.when.size > 0 ||
    Boolean(filters.q.trim())
  );
}

export function escapeHtml(value: string | number): string {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );
}

function renderCard(lead: LeadRecord, now: Date): string {
  const status = getLeadStatus(lead, now);
  const offer =
    lead.offer === "core"
      ? '<span class="core">Core</span>'
      : lead.offer === "downsell"
        ? '<span class="down">Downsell</span>'
        : '<span class="no-offer">No offer</span>';
  const ageClass =
    status.kind === "booked"
      ? "booked"
      : status.kind === "overdue"
        ? "over"
        : status.kind === "unbooked"
          ? "need"
          : "";
  const age = status.label
    ? `<span class="age ${ageClass}">${escapeHtml(status.label)}</span>`
    : "";
  const lastNote = lead.notes.at(-1);
  const nextLine = lead.nextStep
    ? escapeHtml(lead.nextStep)
    : lastNote
      ? `<em>${escapeHtml(lastNote.text)}</em>`
      : "";
  return `<article class="card" draggable="true" data-id="${escapeHtml(lead.id)}" tabindex="0" style="--edge:${status.edge}">
    <div class="c-top">
      <div class="c-name">${escapeHtml(lead.name)}</div>
      <div class="c-val">${escapeHtml(formatMoney(lead.value))}</div>
    </div>
    <div class="c-meta">
      ${offer}
      <span class="dot">·</span>
      <span>${escapeHtml(lead.closer || "Unassigned")}</span>
      ${age}
    </div>
    ${nextLine ? `<div class="c-next">${nextLine}</div>` : ""}
  </article>`;
}

export function renderBoardMarkup(
  leads: LeadRecord[],
  filters: Filters,
  now: Date
): string {
  const visible = visibleLeads(leads, filters, now);
  return STAGES.map((stage) => {
    const stageLeads = visible
      .filter((lead) => lead.stage === stage.id)
      .sort((left, right) => {
        const leftStatus = getLeadStatus(left, now);
        const rightStatus = getLeadStatus(right, now);
        return (
          leftStatus.rank - rightStatus.rank ||
          leftStatus.sortKey - rightStatus.sortKey
        );
      });
    const value = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
    const cards = stageLeads.map((lead) => renderCard(lead, now)).join("");
    return `<section class="col" data-col="${stage.id}">
      <div class="col-head" style="--tint:${stage.tint}">
        <span class="col-title">${stage.name}</span>
        ${stage.sub ? `<span class="col-sub">${stage.sub}</span>` : ""}
        <span class="col-count">${stageLeads.length}${value ? `<small>${formatMoney(value)}</small>` : ""}</span>
      </div>
      <div class="drop" data-stage="${stage.id}">
        ${cards}
        <div class="ghost">Drop here</div>
      </div>
    </section>`;
  }).join("");
}

export function renderReadoutMarkup(
  leads: LeadRecord[],
  filters: Filters,
  now: Date
): string {
  const open = leads.filter(isOpenLead);
  const closed = leads.filter((lead) => lead.stage === "closed");
  const core = open.filter((lead) => lead.offer === "core").length;
  const downsell = open.filter((lead) => lead.offer === "downsell").length;
  const booked = open.filter(
    (lead) => getLeadStatus(lead, now).kind === "booked"
  ).length;
  const unbooked = open.length - booked;
  const overdue = open.filter(
    (lead) => getLeadStatus(lead, now).kind === "overdue"
  ).length;
  const value = closed.reduce((sum, lead) => sum + lead.value, 0);
  return `
    <span><b>${open.length}</b> open</span>
    <span class="sep">/</span>
    <button id="jumpBooked"><b>${booked}</b> booked</button>
    <span class="sep">·</span>
    <button class="${unbooked && !filters.when.has("unbooked") ? "alert" : ""}" id="jumpUnbooked"><b>${unbooked}</b> to book</button>
    ${overdue ? `<span class="sep">·</span><button class="${!filters.when.has("overdue") ? "alert" : ""}" id="jumpOverdue"><b>${overdue}</b> overdue</button>` : ""}
    <span class="sep">/</span>
    <span><b>${core}</b> core <span class="sep">·</span> <b>${downsell}</b> downsell</span>
    <span class="sep">/</span>
    <span><b>${closed.length}</b> closed${value ? ` <span class="sep">·</span> <b>${formatFullMoney(value)}</b>` : ""}</span>
  `;
}
