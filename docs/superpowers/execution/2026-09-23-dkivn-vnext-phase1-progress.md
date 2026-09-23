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
