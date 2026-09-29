---
name: Lifecycle scheduler claims
description: Concurrency and ordering rules for scheduled account jobs (deletion execution, export preparation, purges).
---
Every scheduled job that mutates a request takes a durable per-request claim (claim token + lease timestamp updated with a conditional UPDATE), recovers stale leases, and treats identity-provider 404 as "already done". Deletion re-checks the sole-owner guard immediately before execution and snapshots the verified e-mail from Clerk before deleting the user (provisioned `app_users.email` is often null). Processor outcome rows gate completion; the mail processor is done only when delivery is confirmed.

**Why:** a process-local mutex does not protect multiple instances; support can move a blocked request to in_review; the completion notice needs an address that no longer exists after Clerk deletion.

**How to apply:** new scheduled jobs copy the claim pattern from accountDeletion/accountExport; tests must cover two concurrent ticks and a retry after the provider step already succeeded.
