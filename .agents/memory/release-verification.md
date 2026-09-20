---
name: Onboarding release verification
description: Principle for producing trustworthy release evidence for the flag-gated account/business/lifecycle areas.
---

Release evidence for gated areas must name, per run, the exact database
(a disposable one, never the shared development or production database) and
the exact flag state; a rollback rehearsal runs the production bundle with
every flag unset against that same database.

**Why:** Route tests default to the shared database and flags are read once
per process, so implicit environment makes "green" unverifiable, and the
convergence record was rejected once for claiming more than the evidence
showed.

**How to apply:** Record every run as it happened (including failures and
reruns) in the feature's convergence.md; never check a task or Definition of
Done item that includes a manual step (keyboard/screen-reader, real
identities) on the strength of automated proxies. Transient test status
belongs in convergence/task tracking, not in memory.
