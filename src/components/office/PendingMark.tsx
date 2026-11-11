import { Link } from "@tanstack/react-router";
import { PENDING_DECISIONS } from "@/lib/engine/config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Flags a value that comes from a pending decision (briefing §8) or a builder assumption. */
export function PendingMark({ id }: { id: string }) {
  const d = PENDING_DECISIONS.find((x) => x.id === id);
  if (!d) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/decisoes"
          hash={d.id}
          className="ml-1.5 inline-flex items-center rounded-sm border border-pending/50 bg-pending/10 px-1 py-px align-middle font-mono text-[10px] font-medium uppercase tracking-wider text-pending hover:bg-pending/20"
        >
          pendente
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{d.topic}: {d.value}</p>
        <p className="mt-1 text-xs opacity-80">
          {d.origin === "briefing" ? "Valor sugerido no briefing, aguardando sua confirmação." : "Escolhido na construção, o briefing não definiu."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
