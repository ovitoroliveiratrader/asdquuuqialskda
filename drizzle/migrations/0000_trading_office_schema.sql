-- Roles ---------------------------------------------------------------
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- First account ever created becomes the owner (admin) of the office.
create or replace function public.assign_first_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_assign_owner
  after insert on auth.users for each row execute function public.assign_first_owner();

-- Agents --------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null,
  parent_id uuid references public.agents(id),
  version integer not null default 1,
  name text not null,
  archetype text not null check (archetype in ('paciente','seguidor','contrario','relampago')),
  status text not null default 'ativo' check (status in ('ativo','pausado','arquivado')),
  params jsonb not null,
  symbols text[] not null,
  initial_capital numeric not null check (initial_capital > 0),
  state jsonb not null default '{}'::jsonb,
  equity numeric not null,
  cash numeric not null,
  activity text not null default 'procurando' check (activity in ('procurando','posicionado','pausado')),
  last_cycle_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lineage_id, version)
);
grant select, insert, update on public.agents to authenticated;
grant all on public.agents to service_role;
alter table public.agents enable row level security;
create policy "Owner reads agents" on public.agents
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Owner creates agent versions" on public.agents
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Owner updates agent status" on public.agents
  for update to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Personality is versioned: identity and parameters can never be rewritten.
create or replace function public.protect_agent_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.params is distinct from old.params
     or new.archetype is distinct from old.archetype
     or new.version is distinct from old.version
     or new.lineage_id is distinct from old.lineage_id
     or new.parent_id is distinct from old.parent_id
     or new.symbols is distinct from old.symbols
     or new.initial_capital is distinct from old.initial_capital
     or new.created_at is distinct from old.created_at then
    raise exception 'Parâmetros de um agente são imutáveis. Clone para criar uma nova versão.';
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger agents_protect_identity before update on public.agents
  for each row execute function public.protect_agent_identity();

create or replace function public.default_agent_lineage()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lineage_id is null then new.lineage_id = new.id; end if;
  return new;
end $$;
create trigger agents_default_lineage before insert on public.agents
  for each row execute function public.default_agent_lineage();

-- Trades --------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('compra','venda')),
  price numeric not null,
  reference_price numeric not null,
  quantity numeric not null,
  notional numeric not null,
  fee numeric not null,
  slippage_cost numeric not null,
  realized_pnl numeric,
  reason text not null,
  indicators jsonb not null default '{}'::jsonb,
  candle_time timestamptz not null,
  created_at timestamptz not null default now()
);
create index trades_agent_time_idx on public.trades (agent_id, candle_time desc);
grant select on public.trades to authenticated;
grant all on public.trades to service_role;
alter table public.trades enable row level security;
create policy "Owner reads trades" on public.trades
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Equity history ------------------------------------------------------
create table public.equity_snapshots (
  id bigint generated always as identity primary key,
  agent_id uuid not null references public.agents(id) on delete cascade,
  taken_at timestamptz not null,
  equity numeric not null,
  cash numeric not null,
  positions_value numeric not null
);
create index equity_agent_time_idx on public.equity_snapshots (agent_id, taken_at);
grant select on public.equity_snapshots to authenticated;
grant all on public.equity_snapshots to service_role;
alter table public.equity_snapshots enable row level security;
create policy "Owner reads equity" on public.equity_snapshots
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Daily ranking -------------------------------------------------------
create table public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  taken_at timestamptz not null default now(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  position integer not null,
  equity numeric not null,
  return_pct numeric not null,
  max_drawdown_pct numeric not null,
  trades_count integer not null,
  fees_paid numeric not null,
  weekly_consistency_pct numeric,
  days_running numeric not null,
  promotion jsonb not null default '{}'::jsonb,
  unique (snapshot_date, agent_id)
);
grant select on public.ranking_snapshots to authenticated;
grant all on public.ranking_snapshots to service_role;
alter table public.ranking_snapshots enable row level security;
create policy "Owner reads ranking" on public.ranking_snapshots
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Scheduler health ----------------------------------------------------
create table public.cycle_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ciclo','ranking')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'rodando' check (status in ('rodando','ok','erro')),
  message text,
  details jsonb not null default '{}'::jsonb
);
create index cycle_runs_started_idx on public.cycle_runs (started_at desc);
grant select on public.cycle_runs to authenticated;
grant all on public.cycle_runs to service_role;
alter table public.cycle_runs enable row level security;
create policy "Owner reads cycle runs" on public.cycle_runs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Initial personalities (briefing archetypes) ------------------------
insert into public.agents (id, lineage_id, version, name, archetype, params, symbols, initial_capital, equity, cash, notes) values
('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',1,'Paciente','paciente',
 '{"timeframe":"4h","mediaRapida":50,"mediaLenta":200,"mediaLonga":300,"rompimentoCandles":6,"atrPeriodo":14,"stopAtr":3,"trailingAtr":3,"riscoPorOperacao":0.005,"alocacaoMaxima":0.5}',
 '{BTCUSDT,ETHUSDT}',10000,10000,10000,'Arquétipo do briefing: tendência confirmada, poucas operações.'),
('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222',1,'Seguidor','seguidor',
 '{"timeframe":"1h","mediaRapida":20,"mediaLenta":50,"canalEntrada":20,"canalSaida":10,"atrPeriodo":14,"stopAtr":2,"riscoPorOperacao":0.01,"alocacaoMaxima":0.5}',
 '{BTCUSDT,ETHUSDT}',10000,10000,10000,'Arquétipo do briefing: momentum com médias e rompimentos.'),
('33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333',1,'Contrário','contrario',
 '{"timeframe":"15m","rsiPeriodo":14,"rsiEntrada":30,"rsiSaida":65,"bollingerPeriodo":20,"bollingerDesvios":2,"atrPeriodo":14,"stopAtr":2.5,"riscoPorOperacao":0.01,"alocacaoMaxima":0.5}',
 '{BTCUSDT,ETHUSDT}',10000,10000,10000,'Arquétipo do briefing: compra sobrevendido, vende sobrecomprado.'),
('44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444',1,'Relâmpago','relampago',
 '{"timeframe":"1m","mediaRapida":9,"mediaLenta":21,"rsiPeriodo":14,"rsiMinimo":55,"atrPeriodo":14,"stopAtr":1.5,"alvoPercentual":0.004,"riscoPorOperacao":0.02,"alocacaoMaxima":0.5}',
 '{BTCUSDT,ETHUSDT}',10000,10000,10000,'Arquétipo do briefing: operações curtas, muitas por dia.');
