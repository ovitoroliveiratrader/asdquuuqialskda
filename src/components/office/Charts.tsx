import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { dateTimeBR, money } from "@/lib/format";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" };
const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)" },
};

export function EquityChart({ data, initial }: { data: { t: number; equity: number }[]; initial: number }) {
  if (data.length < 2) {
    return <p className="py-16 text-center text-sm text-muted-foreground">O histórico aparece depois de algumas horas de ciclos (um ponto por hora).</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(v) => dateTimeBR(v)} {...axis} minTickGap={60} />
        <YAxis domain={[(min: number) => Math.min(min, initial) * 0.995, (max: number) => Math.max(max, initial) * 1.005]} tickFormatter={(v) => money(v, 0)} width={70} {...axis} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => dateTimeBR(v as number)} formatter={(v: number) => [money(v), "Patrimônio"]} />
        <Area type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={1.5} fill="url(#eq)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PriceTradesChart({
  candles,
  buys,
  sells,
}: {
  candles: { t: number; close: number }[];
  buys: { t: number; price: number }[];
  sells: { t: number; price: number }[];
}) {
  if (candles.length === 0) return <p className="py-16 text-center text-sm text-muted-foreground">Carregando preços…</p>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(v) => dateTimeBR(v)} {...axis} minTickGap={60} allowDuplicatedCategory={false} />
        <YAxis dataKey="close" domain={["auto", "auto"]} tickFormatter={(v) => money(v, 0)} width={70} {...axis} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => dateTimeBR(v as number)} formatter={(v: number) => money(v)} />
        <Line data={candles} dataKey="close" name="Preço" stroke="var(--foreground)" strokeOpacity={0.7} dot={false} strokeWidth={1.2} isAnimationActive={false} />
        <Scatter data={buys.map((b) => ({ t: b.t, close: b.price }))} name="Compra" fill="var(--gain)" shape="triangle" isAnimationActive={false} />
        <Scatter data={sells.map((s) => ({ t: s.t, close: s.price }))} name="Venda" fill="var(--loss)" shape="diamond" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
