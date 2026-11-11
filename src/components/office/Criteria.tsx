import { Check, X } from "lucide-react";
import type { Criterion } from "@/lib/engine/metrics";

export function CriteriaList({ criteria }: { criteria: Criterion[] }) {
  return (
    <ul className="grid gap-2">
      {criteria.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-sm">
          {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-gain" /> : <X className="mt-0.5 size-4 shrink-0 text-loss" />}
          <span className="flex-1">
            {c.label}
            <span className="num block text-xs text-muted-foreground">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
