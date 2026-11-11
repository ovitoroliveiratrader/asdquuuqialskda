<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Simulated mode only: no code path places real Binance orders; market data comes from the public `data-api.binance.vision` host without keys. Why: briefing forbids real capital before validation and any key with withdrawal permission.
- The trading engine in `src/lib/engine/` is pure and deterministic, shared by the live cycle (`/api/public/jobs/cycle`) and the browser backtest. Why: ranking numbers must be reproducible from history.
- Indicators are window-exact (simple averages, Cutler RSI, SMA-based ATR). Why: live cycles see a recent window while backtests see long history; both must yield the same value per candle.
- Agent params, archetype, version and capital are immutable (DB trigger); changes happen by cloning into a new version. Why: personalities must be versioned and auditable.
- Every value the briefing left open lives in `PENDING_DECISIONS` (`src/lib/engine/config.ts`) and is flagged in the UI with `PendingMark`. Why: the owner must confirm each one.
- The first account created becomes the owner (admin); all data reads require that role. Why: private office.
