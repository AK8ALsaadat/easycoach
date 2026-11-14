"use client";
import { useState, type ReactNode } from "react";

/** Mount on the first visit, then retain drafts and selections across tabs. */
export function VisitedPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return active || visited ? children : null;
}
