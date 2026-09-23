import { readFile } from "node:fs/promises";

const files = {
  engine: "vnext-repos/dkivn-engine/infra/systemd/dkivn-engine.service",
  control: "vnext-repos/dkivn-console/infra/systemd/dkivn-control-api.service",
  console: "vnext-repos/dkivn-console/infra/systemd/dkivn-console.service",
};

const units = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([name, file]) => [name, await readFile(file, "utf8")]))
);

for (const [name, unit] of Object.entries(units)) {
  if (/^(?:PartOf|BindsTo)=/m.test(unit)) {
    throw new Error(`${name}: must not use PartOf= or BindsTo= cross-service lifecycle coupling`);
  }
  if (!/^Restart=/m.test(unit)) {
    throw new Error(`${name}: missing independent Restart policy`);
  }
}

if (/dkivn-(?:control-api|console)\.service/.test(units.engine)) {
  throw new Error("engine: must not depend on console/control service");
}
if (!/ExecStart=.*engine/m.test(units.engine)) throw new Error("engine: ExecStart must be engine-specific");
if (!/ExecStart=.*control-api/m.test(units.control)) throw new Error("control: ExecStart must be control-api-specific");
if (!/ExecStart=.*next.*start/m.test(units.console)) throw new Error("console: ExecStart must launch only Next.js web");

const scripts = [
  "vnext-repos/dkivn-console/scripts/verify-isolation.sh",
  "vnext-repos/dkivn-console/scripts/verify-postgres-outage.sh",
  "vnext-repos/dkivn-console/scripts/verify-venue-isolation.sh",
];

for (const script of scripts) {
  const source = await readFile(script, "utf8");
  if (!source.startsWith("#!/usr/bin/env bash")) throw new Error(`${script}: missing bash shebang`);
  if (!source.includes("set -euo pipefail")) throw new Error(`${script}: must fail closed`);
}

console.log("VNEXT_ISOLATION_STATIC_OK");
