"use client";

import { useState, type ReactNode } from "react";
import { SegmentedToggle } from "./ui/button";

export function ChangeTabs({ variations, disputes }: { variations: ReactNode; disputes: ReactNode }) {
  const [tab, setTab] = useState("variations");
  return (
    <div>
      <SegmentedToggle
        label="Changes"
        value={tab}
        options={[
          { value: "variations", label: "Variations" },
          { value: "disputes", label: "Disputes" },
        ]}
        onChange={setTab}
      />
      <div hidden={tab !== "variations"}>{variations}</div>
      <div hidden={tab !== "disputes"}>{disputes}</div>
    </div>
  );
}
