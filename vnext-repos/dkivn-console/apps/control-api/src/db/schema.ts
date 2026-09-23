import {
  bigint,
  bigserial,
  date,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const strategyConfigs = pgTable("strategy_configs", {
  id: uuid("id").primaryKey(),
  version: text("version").notNull().unique(),
  generation: bigint("generation", { mode: "bigint" }).notNull().unique(),
  status: text("status").notNull(),
  checksum: text("checksum").notNull(),
  configJson: jsonb("config_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const strategyPromotions = pgTable("strategy_promotions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  configId: uuid("config_id").notNull().references(() => strategyConfigs.id),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  venueScope: text("venue_scope").array().notNull(),
  symbolScope: text("symbol_scope").array().notNull(),
  promotedAt: timestamp("promoted_at", { withTimezone: true }).notNull().defaultNow(),
  promotedBy: text("promoted_by").notNull(),
  validationResultJson: jsonb("validation_result_json").notNull(),
});

export const venueRuntimeLatest = pgTable("venue_runtime_latest", {
  venue: text("venue").primaryKey(),
  sourceAt: timestamp("source_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const symbolRuntimeLatest = pgTable("symbol_runtime_latest", {
  venue: text("venue").notNull(),
  symbol: text("symbol").notNull(),
  sourceAt: timestamp("source_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.venue, table.symbol] }),
]);

export const venueDailyMetrics = pgTable("venue_daily_metrics", {
  day: date("day").notNull(),
  venue: text("venue").notNull(),
  equityOpen: doublePrecision("equity_open"),
  equityClose: doublePrecision("equity_close"),
  realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
  fees: doublePrecision("fees").notNull().default(0),
  funding: doublePrecision("funding").notNull().default(0),
  rebate: doublePrecision("rebate").notNull().default(0),
  tradedVolume: doublePrecision("traded_volume").notNull().default(0),
  makerVolume: doublePrecision("maker_volume").notNull().default(0),
  takerVolume: doublePrecision("taker_volume").notNull().default(0),
  coreWearBps: doublePrecision("core_wear_bps").notNull().default(0),
  netWearBps: doublePrecision("net_wear_bps").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.day, table.venue] }),
  index("venue_daily_day_venue_idx").on(table.day, table.venue),
]);

export const symbolDailyMetrics = pgTable("symbol_daily_metrics", {
  day: date("day").notNull(),
  venue: text("venue").notNull(),
  symbol: text("symbol").notNull(),
  realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
  fees: doublePrecision("fees").notNull().default(0),
  funding: doublePrecision("funding").notNull().default(0),
  rebate: doublePrecision("rebate").notNull().default(0),
  tradedVolume: doublePrecision("traded_volume").notNull().default(0),
  makerVolume: doublePrecision("maker_volume").notNull().default(0),
  takerVolume: doublePrecision("taker_volume").notNull().default(0),
  coreWearBps: doublePrecision("core_wear_bps").notNull().default(0),
  netWearBps: doublePrecision("net_wear_bps").notNull().default(0),
  fills: bigint("fills", { mode: "number" }).notNull().default(0),
  cancels: bigint("cancels", { mode: "number" }).notNull().default(0),
  orderCount: bigint("order_count", { mode: "number" }).notNull().default(0),
  maxInventory: doublePrecision("max_inventory").notNull().default(0),
  avgInventory: doublePrecision("avg_inventory").notNull().default(0),
  adverseFillRatio: doublePrecision("adverse_fill_ratio").notNull().default(0),
  markout50Bps: doublePrecision("markout_50_bps").notNull().default(0),
  markout100Bps: doublePrecision("markout_100_bps").notNull().default(0),
  markout250Bps: doublePrecision("markout_250_bps").notNull().default(0),
  markout500Bps: doublePrecision("markout_500_bps").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.day, table.venue, table.symbol] }),
  index("symbol_daily_day_venue_symbol_idx").on(table.day, table.venue, table.symbol),
]);

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  level: text("level").notNull(),
  venue: text("venue"),
  symbol: text("symbol"),
  type: text("type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  firstSeenMonoNs: numeric("first_seen_mono_ns", { precision: 30, scale: 0 }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  ageMs: bigint("age_ms", { mode: "number" }).notNull(),
  rootCauseCode: text("root_cause_code").notNull(),
  summary: text("summary").notNull(),
  truthSnapshot: jsonb("truth_snapshot").notNull(),
  automaticAction: text("automatic_action").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  unique("alerts_fingerprint_started_at_key").on(table.fingerprint, table.startedAt),
  index("alerts_active_level_started_idx").on(table.resolvedAt, table.level, table.startedAt),
]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_log_created_at_idx").on(table.createdAt),
]);
