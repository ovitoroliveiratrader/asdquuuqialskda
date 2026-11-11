const TZ = "America/Sao_Paulo";

export const usd = (v: number, digits = 2) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} USDT`;

export const money = (v: number, digits = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const pctPlain = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const qty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

export const dateTimeBR = (v: string | number | Date) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const dateBR = (v: string | number | Date) =>
  new Date(v).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

export const pair = (s: string) => s.replace("USDT", "/USDT");

export const signClass = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? "text-muted-foreground" : v > 0 ? "text-gain" : "text-loss";

export function relative(v: string | number | Date) {
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}
