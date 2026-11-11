import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Agent = Database["public"]["Tables"]["agents"]["Row"];
export type Trade = Database["public"]["Tables"]["trades"]["Row"];
export type RankingRow = Database["public"]["Tables"]["ranking_snapshots"]["Row"];
export type CycleRun = Database["public"]["Tables"]["cycle_runs"]["Row"];

const must = <T,>(r: { data: T | null; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const ownerQuery = queryOptions({
  queryKey: ["owner"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { isOwner: false, email: null as string | null };
    const r = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    return { isOwner: !!r.data?.some((x) => x.role === "admin"), email: u.user.email ?? null };
  },
});

export const agentsQuery = queryOptions({
  queryKey: ["agents"],
  queryFn: async () => must(await supabase.from("agents").select("*").order("created_at")) as Agent[],
  refetchInterval: 60_000,
});

export const agentQuery = (id: string) =>
  queryOptions({
    queryKey: ["agent", id],
    queryFn: async () => must(await supabase.from("agents").select("*").eq("id", id).maybeSingle()) as Agent | null,
    refetchInterval: 60_000,
  });

export const lastTradesQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["last-trades", ids],
    queryFn: async () => {
      const lists = await Promise.all(
        ids.map(async (id) =>
          must(await supabase.from("trades").select("*").eq("agent_id", id).order("candle_time", { ascending: false }).order("created_at", { ascending: false }).limit(3)) as Trade[],
        ),
      );
      return Object.fromEntries(ids.map((id, i) => [id, lists[i]])) as Record<string, Trade[]>;
    },
    refetchInterval: 60_000,
  });

export const agentTradesQuery = (id: string) =>
  queryOptions({
    queryKey: ["agent-trades", id],
    queryFn: async () =>
      must(await supabase.from("trades").select("*").eq("agent_id", id).order("candle_time", { ascending: false }).limit(500)) as Trade[],
    refetchInterval: 60_000,
  });

export const equityQuery = (id: string) =>
  queryOptions({
    queryKey: ["equity", id],
    queryFn: async () => {
      const out: { taken_at: string; equity: number }[] = [];
      for (let from = 0; from < 10_000; from += 1000) {
        const rows = must(
          await supabase.from("equity_snapshots").select("taken_at, equity").eq("agent_id", id).order("taken_at").range(from, from + 999),
        ) as { taken_at: string; equity: number }[];
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out.map((r) => ({ t: Date.parse(r.taken_at), equity: Number(r.equity) }));
    },
    refetchInterval: 5 * 60_000,
  });

export const rankingQuery = queryOptions({
  queryKey: ["ranking"],
  queryFn: async () => {
    const latest = must(
      await supabase.from("ranking_snapshots").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1),
    ) as { snapshot_date: string }[];
    if (!latest.length) return { date: null as string | null, rows: [] as RankingRow[] };
    const rows = must(
      await supabase.from("ranking_snapshots").select("*").eq("snapshot_date", latest[0]!.snapshot_date).order("position"),
    ) as RankingRow[];
    return { date: latest[0]!.snapshot_date, rows };
  },
});

export const cyclesQuery = queryOptions({
  queryKey: ["cycles"],
  queryFn: async () =>
    must(await supabase.from("cycle_runs").select("*").order("started_at", { ascending: false }).limit(20)) as CycleRun[],
  refetchInterval: 60_000,
});
