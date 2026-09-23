# SDD ledger — plan: docs/superpowers/plans/2026-09-23-dkivn-vnext-phase1-foundation.md

Executor: inline fallback because this harness exposes no subagent-dispatch tool.

Ruling: New private GitHub repositories cannot be created with the available GitHub connector. Stage the three repositories as self-contained export-ready roots under `vnext-repos/` on the isolated branch. This preserves package/process boundaries; actual repository creation remains a later infrastructure action. Cost if wrong: one repository extraction/move, no runtime semantic rewrite.

Ruling: Task 0 requires publishing `@dkivn/contracts` while Task 1 originally marks it `private: true`. The package must be publishable in the eventual private contracts repo, so `private` is set to false and publication is disabled operationally in the current public staging fork. Cost if wrong: package metadata adjustment before first publication.

Pre-flight shared interfaces:
- Task 0 -> Task 1/2: exact `@dkivn/contracts` versioning; staged monorepo root must preserve eventual package identity. Clean after ruling above.
- Task 1 -> Task 2: enums exported from `src/index.ts`; Task 2 consumes exact names. Clean.
- Task 2 -> Task 3/5/7/8/9: control, telemetry and alert schemas feed engine/control API. Clean.
- Task 3 -> Task 4/9: framed generation-fenced UDS protocol. Clean.
- Task 4 -> Task 9: immutable config apply semantics. Clean.
- Task 5 -> Task 7: bounded engine telemetry feeds collector. Clean.
- Task 6 -> Task 7/8/9/10: PostgreSQL read models and durable state. Clean.
- Task 7/8/9 -> Task 10: read/control APIs feed console. Clean.
- Task 10 -> Task 11/12: console behavior is acceptance-tested for isolation. Clean.

Task 0: complete (staged export-ready repo boundaries; vnext-boundaries-ci run 35823062897 -> success; actual private repo creation deferred by connector limitation)

Task 1: complete (RED run 35823184821: enum test failure; GREEN run 35823226175: enum tests success + TypeScript build success; commits 73cc524..5edf4b4)
Task 2: Ruling: AlertEvent.firstSeenMonoNs crosses JSON/process boundaries, so the contract represents it as a non-negative decimal string and engines may parse it to BigInt internally. Native bigint is not JSON serializable. Cost if wrong: adapter conversion at service boundary.

Task 2: complete (RED run 35823315202: shared contract tests failure; GREEN run 35823421545: all contracts tests + TypeScript build success; commits b8d176a..a1284c6)

Task 3: complete (RED run 35823537719: engine test failure; GREEN run 35823625260: control tests + TypeScript build success; commits 1d85f4b..8be82a6)

Task 4: complete (RED run 35823710017: immutable config tests failure; GREEN run 35823796233: engine tests + TypeScript build success; commits bae1386..3068923)

Task 5: complete (RED run 35823883629: telemetry tests failure; first GREEN attempt run 35823951213: tests passed but TypeScript build failed TS2412; root cause exactOptionalPropertyTypes on optional class callback; fix commit 3fd55fa; final GREEN run 35824037611: engine tests + TypeScript build success)

Task 6: complete (RED run 35824194826: migration step failed before runner/schema existed; run 35824341855: migration + PostgreSQL integration tests passed but TypeScript build failed on unused drizzle optional-driver declarations; root cause verified from job 107062701424; fix skipLibCheck for node_modules only; final GREEN run 35824442020: migration + integration tests + build all success)
