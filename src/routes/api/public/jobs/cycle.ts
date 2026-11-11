import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Simulated mode only: this cycle reads public Binance prices and updates virtual wallets.
export const Route = createFileRoute("/api/public/jobs/cycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runCycle } = await import("@/lib/office/cycle.server");
        try {
          const result = await runCycle(supabaseAdmin);
          return Response.json({ ok: true, result });
        } catch (e) {
          console.error(e);
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "erro" }, { status: 500 });
        }
      },
    },
  },
});
