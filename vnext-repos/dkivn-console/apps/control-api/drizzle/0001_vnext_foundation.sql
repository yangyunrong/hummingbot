BEGIN;

CREATE TABLE strategy_configs (
  id uuid PRIMARY KEY,
  version text NOT NULL UNIQUE,
  generation bigint NOT NULL UNIQUE CHECK (generation >= 0),
  status text NOT NULL,
  checksum text NOT NULL,
  config_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE strategy_promotions (
  id bigserial PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES strategy_configs(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  venue_scope text[] NOT NULL,
  symbol_scope text[] NOT NULL,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  promoted_by text NOT NULL,
  validation_result_json jsonb NOT NULL
);

CREATE TABLE venue_runtime_latest (
  venue text PRIMARY KEY,
  source_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE symbol_runtime_latest (
  venue text NOT NULL,
  symbol text NOT NULL,
  source_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol)
);

CREATE TABLE venue_daily_metrics (
  day date NOT NULL,
  venue text NOT NULL,
  equity_open double precision,
  equity_close double precision,
  realized_pnl double precision NOT NULL DEFAULT 0,
  fees double precision NOT NULL DEFAULT 0,
  funding double precision NOT NULL DEFAULT 0,
  rebate double precision NOT NULL DEFAULT 0,
  traded_volume double precision NOT NULL DEFAULT 0,
  maker_volume double precision NOT NULL DEFAULT 0,
  taker_volume double precision NOT NULL DEFAULT 0,
  core_wear_bps double precision NOT NULL DEFAULT 0,
  net_wear_bps double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (day, venue)
);

CREATE TABLE symbol_daily_metrics (
  day date NOT NULL,
  venue text NOT NULL,
  symbol text NOT NULL,
  realized_pnl double precision NOT NULL DEFAULT 0,
  fees double precision NOT NULL DEFAULT 0,
  funding double precision NOT NULL DEFAULT 0,
  rebate double precision NOT NULL DEFAULT 0,
  traded_volume double precision NOT NULL DEFAULT 0,
  maker_volume double precision NOT NULL DEFAULT 0,
  taker_volume double precision NOT NULL DEFAULT 0,
  core_wear_bps double precision NOT NULL DEFAULT 0,
  net_wear_bps double precision NOT NULL DEFAULT 0,
  fills bigint NOT NULL DEFAULT 0,
  cancels bigint NOT NULL DEFAULT 0,
  order_count bigint NOT NULL DEFAULT 0,
  max_inventory double precision NOT NULL DEFAULT 0,
  avg_inventory double precision NOT NULL DEFAULT 0,
  adverse_fill_ratio double precision NOT NULL DEFAULT 0,
  markout_50_bps double precision NOT NULL DEFAULT 0,
  markout_100_bps double precision NOT NULL DEFAULT 0,
  markout_250_bps double precision NOT NULL DEFAULT 0,
  markout_500_bps double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (day, venue, symbol)
);

CREATE TABLE alerts (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  level text NOT NULL,
  venue text,
  symbol text,
  type text NOT NULL,
  started_at timestamptz NOT NULL,
  first_seen_mono_ns numeric(30,0) NOT NULL CHECK (first_seen_mono_ns >= 0),
  last_seen_at timestamptz NOT NULL,
  age_ms bigint NOT NULL CHECK (age_ms >= 0),
  root_cause_code text NOT NULL,
  summary text NOT NULL,
  truth_snapshot jsonb NOT NULL,
  automatic_action text NOT NULL,
  resolved_at timestamptz,
  UNIQUE (fingerprint, started_at)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alerts_active_level_started_idx
  ON alerts (resolved_at, level, started_at DESC);
CREATE INDEX symbol_daily_day_venue_symbol_idx
  ON symbol_daily_metrics (day DESC, venue, symbol);
CREATE INDEX venue_daily_day_venue_idx
  ON venue_daily_metrics (day DESC, venue);
CREATE INDEX audit_log_created_at_idx
  ON audit_log (created_at DESC);

COMMIT;
