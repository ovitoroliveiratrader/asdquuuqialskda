import { useQuery } from "@tanstack/react-query";
import { fetchPrices } from "@/lib/engine/binance";
import { SYMBOLS } from "@/lib/engine/config";
import { money, pair } from "@/lib/format";

export function Ticker() {
  const { data } = useQuery({
    queryKey: ["ticker"],
    queryFn: () => fetchPrices([...SYMBOLS]),
    refetchInterval: 15_000,
  });
  return (
    <div className="flex items-center gap-5 rounded-sm border border-border bg-card px-4 py-2 font-mono text-sm">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="size-1.5 animate-blink rounded-full bg-gain" /> Binance
      </span>
      {SYMBOLS.map((s) => (
        <span key={s} className="num">
          <span className="text-muted-foreground">{pair(s)}</span> {data?.[s] !== undefined ? money(data[s]) : "…"}
        </span>
      ))}
    </div>
  );
}
