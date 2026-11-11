import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { INITIAL_CAPITAL } from "@/lib/engine/config";
import { initialState, normalizeState } from "@/lib/engine/simulator";
import { STRATEGIES, type Params } from "@/lib/engine/strategies";
import type { Archetype } from "@/lib/engine/types";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };

async function assertOwner(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Somente o dono do escritório pode fazer isso.");
}

export const setAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ agentId: z.string().uuid(), status: z.enum(["ativo", "pausado", "arquivado"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { data: agent, error } = await context.supabase.from("agents").select("*").eq("id", data.agentId).single();
    if (error || !agent) throw new Error("Agente não encontrado.");
    if (agent.status === "arquivado") throw new Error("Agente arquivado não volta a operar. Clone para criar uma nova versão.");

    const state = normalizeState(agent.state, Number(agent.initial_capital));
    // Resuming never trades the candles missed while paused.
    if (data.status === "ativo" && agent.status === "pausado") state.lastProcessed = {};
    const activity = data.status === "ativo" ? (Object.keys(state.positions).length ? "posicionado" : "procurando") : "pausado";

    const upd = await context.supabase
      .from("agents")
      .update({ status: data.status, activity, state: state as unknown as Json })
      .eq("id", data.agentId);
    if (upd.error) throw new Error(upd.error.message);
    return { ok: true };
  });

export const cloneAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        params: z.record(z.union([z.number(), z.string()])),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { data: src, error } = await context.supabase.from("agents").select("*").eq("id", data.agentId).single();
    if (error || !src) throw new Error("Agente de origem não encontrado.");

    const strategy = STRATEGIES[src.archetype as Archetype];
    const old = src.params as Params;
    const params: Params = { ...old };
    for (const f of strategy.fields) {
      const v = Number(data.params[f.key]);
      if (!Number.isFinite(v) || v < f.min || v > f.max) throw new Error(`${f.label}: valor fora do intervalo ${f.min} a ${f.max}.`);
      params[f.key] = f.kind === "int" ? Math.round(v) : v;
    }

    const { data: family } = await context.supabase
      .from("agents")
      .select("version")
      .eq("lineage_id", src.lineage_id)
      .order("version", { ascending: false })
      .limit(1);
    const version = (family?.[0]?.version ?? src.version) + 1;

    const ins = await context.supabase
      .from("agents")
      .insert({
        lineage_id: src.lineage_id,
        parent_id: src.id,
        version,
        name: data.name,
        archetype: src.archetype,
        params: params as Json,
        symbols: src.symbols,
        initial_capital: INITIAL_CAPITAL,
        state: initialState(INITIAL_CAPITAL) as unknown as Json,
        equity: INITIAL_CAPITAL,
        cash: INITIAL_CAPITAL,
        notes: data.notes || `Clonado de ${src.name} v${src.version}.`,
      })
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return { id: ins.data.id, version };
  });

export const runCycleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCycle } = await import("./cycle.server");
    return runCycle(supabaseAdmin);
  });

export const recomputeRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runRanking } = await import("./cycle.server");
    return runRanking(supabaseAdmin);
  });
