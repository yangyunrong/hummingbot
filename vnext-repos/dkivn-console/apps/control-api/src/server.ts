import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createDb } from "./db/client.js";
import { registerTelemetryCollectorRoutes } from "./telemetry/collector.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerRuntimeCommandRoutes } from "./routes/commands.js";
import { registerConfigRoutes } from "./routes/configs.js";
import { EngineClient, type EngineCommandClient } from "./ipc/engine-client.js";

type Authorize = (request: FastifyRequest) => string | null;

export interface BuildServerOptions {
  pool: Pool;
  mutationsEnabled: boolean;
  engineClient: EngineCommandClient;
  authorize: Authorize;
  staleAfterMs?: number;
}

function registerMutationDisabledRoutes(app: FastifyInstance): void {
  const disabled = async (_request: FastifyRequest, reply: any) =>
    reply.code(503).send({ code: "CONTROL_MUTATIONS_DISABLED" });

  app.post("/api/runtime/:venue/:action", disabled);
  app.post("/api/runtime/:venue/disarm", disabled);
  app.post("/api/runtime/:venue/cancel-owned", disabled);
  app.post("/api/configs/drafts", disabled);
  app.patch("/api/configs/drafts/:id", disabled);
  app.post("/api/configs/:id/promote", disabled);
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    service: "dkivn-control-api",
    controlMutationsEnabled: options.mutationsEnabled,
  }));

  registerTelemetryCollectorRoutes(app, { pool: options.pool });
  registerRuntimeRoutes(app, {
    pool: options.pool,
    staleAfterMs: options.staleAfterMs ?? 2000,
  });
  registerAlertRoutes(app, { pool: options.pool });

  if (options.mutationsEnabled) {
    registerRuntimeCommandRoutes(app, {
      pool: options.pool,
      engineClient: options.engineClient,
      authorize: options.authorize,
    });
    registerConfigRoutes(app, {
      pool: options.pool,
      engineClient: options.engineClient,
      authorize: options.authorize,
    });
  } else {
    registerMutationDisabledRoutes(app);
  }

  return app;
}

function envAuthorize(request: FastifyRequest): string | null {
  const token = process.env.DKIVN_OPERATOR_TOKEN;
  if (!token) return null;
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${token}`) return null;
  return "operator";
}

export async function startServer(): Promise<void> {
  const { pool } = createDb();
  const mutationsEnabled = process.env.DKIVN_CONTROL_MUTATIONS_ENABLED === "true";
  const engineClient = new EngineClient({
    socketPath: process.env.DKIVN_ENGINE_SOCKET ?? "/run/dkivn/engine-control.sock",
    timeoutMs: Number(process.env.DKIVN_ENGINE_CONTROL_TIMEOUT_MS ?? "500"),
  });

  const app = buildServer({
    pool,
    mutationsEnabled,
    engineClient,
    authorize: envAuthorize,
    staleAfterMs: Number(process.env.DKIVN_RUNTIME_STALE_AFTER_MS ?? "2000"),
  });

  const host = process.env.DKIVN_CONTROL_HOST ?? "127.0.0.1";
  const port = Number(process.env.DKIVN_CONTROL_PORT ?? "8081");

  const shutdown = async () => {
    await app.close();
    await pool.end();
  };
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));

  await app.listen({ host, port });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
