import { describe, expect, it } from "vitest";
import {
  VenueSchema,
  RuntimeStateSchema,
  StrategyModeSchema,
  OrderLifecycleStateSchema,
} from "../src/index.js";

describe("core enums", () => {
  it("accepts only supported venues", () => {
    expect(VenueSchema.parse("TOOBIT")).toBe("TOOBIT");
    expect(VenueSchema.parse("BITGET")).toBe("BITGET");
    expect(() => VenueSchema.parse("BINANCE")).toThrow();
  });

  it("does not infer runtime state", () => {
    expect(RuntimeStateSchema.parse("RUNNING")).toBe("RUNNING");
    expect(() => RuntimeStateSchema.parse("ONLINE")).toThrow();
  });

  it("pins supported strategies and order lifecycle states", () => {
    expect(StrategyModeSchema.parse("HYBRID_MM")).toBe("HYBRID_MM");
    expect(OrderLifecycleStateSchema.parse("UNKNOWN")).toBe("UNKNOWN");
    expect(() => OrderLifecycleStateSchema.parse("RETRYING_BLINDLY")).toThrow();
  });
});
