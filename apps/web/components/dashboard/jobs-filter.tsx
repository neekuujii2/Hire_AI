"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const STATUSES = ["all", "active", "draft", "paused", "closed"] as const;

export function JobsFilter() {
  const [active, setActive] = useState<string>("all");

  return (
    <div className="mt-6 flex items-center gap-2">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setActive(s)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[12px] font-medium capitalize transition-colors",
            active === s
              ? "border-accent bg-accent text-white"
              : "border-line bg-panel text-muted hover:border-faint hover:text-ink",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
