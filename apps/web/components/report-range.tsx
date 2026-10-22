"use client";

import { useState } from "react";
import { SegmentedToggle } from "./ui/button";

export function ReportRange({ daily, weekly }: { daily: string; weekly: string }) {
  const [range, setRange] = useState("weekly");
  return (
    <div>
      <SegmentedToggle
        label="Report range"
        value={range}
        options={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
        ]}
        onChange={setRange}
      />
      <p>{range === "daily" ? daily : weekly}</p>
    </div>
  );
}
