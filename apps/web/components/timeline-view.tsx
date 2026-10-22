"use client";

import { useState } from "react";
import { SegmentedToggle } from "./ui/button";

export type TimelineItem = {
  id: string;
  day: string;
  when: string;
  absolute: string;
  filter: string;
  title: string;
  detail: string;
  stamp: number;
  proof?: string;
  thumbs?: { src: string; alt: string }[];
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "photos", label: "Photos" },
  { value: "ai", label: "AI checks" },
  { value: "approvals", label: "Approvals" },
  { value: "payments", label: "Payments" },
  { value: "changes", label: "Changes" },
  { value: "fees", label: "Fees" },
];

export function TimelineView({ items, total, nextHref }: { items: TimelineItem[]; total: number; nextHref: string | null }) {
  const [filter, setFilter] = useState("all");
  const shown = filter === "all" ? items : items.filter((item) => item.filter === filter);
  const days: { day: string; rows: TimelineItem[] }[] = [];
  for (const item of shown) {
    const last = days[days.length - 1];
    if (!last || last.day !== item.day) days.push({ day: item.day, rows: [item] });
    else last.rows.push(item);
  }
  return (
    <div>
      <SegmentedToggle label="Timeline filters" value={filter} options={FILTERS} onChange={setFilter} />
      {shown.length === 0 ? <p>{total === 0 ? "Nothing has happened on this project yet." : "Nothing in this filter."}</p> : null}
      {days.map((group) => (
        <section key={group.day}>
          <h2 className="day-label">{group.day}</h2>
          <ol className="timeline">
            {group.rows.map((item) => (
              <li key={item.id}>
                <article className="card">
                  <p className="faint" title={item.absolute}>{item.when}</p>
                  <h3>{item.title}</h3>
                  {item.detail ? <p>{item.detail}</p> : null}
                  {item.thumbs && item.thumbs.length > 0 ? (
                    <div className="photo-grid">
                      {item.thumbs.map((thumb) => (
                        <img key={thumb.src} src={thumb.src} alt={thumb.alt} />
                      ))}
                    </div>
                  ) : null}
                  {item.proof ? <p><a href={item.proof}>Proof ↗</a></p> : null}
                </article>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {nextHref ? <p><a href={nextHref}>Older events</a></p> : null}
    </div>
  );
}
