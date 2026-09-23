import type { Pool } from "pg";

export async function allocateGeneration(pool: Pool): Promise<string> {
  const result = await pool.query<{ generation: string }>(
    "SELECT nextval('dkivn_control_generation')::text AS generation",
  );
  const value = result.rows[0]?.generation;
  if (!value) throw new Error("CONTROL_GENERATION_UNAVAILABLE");
  return value;
}
