# Feature specifications

Create one directory per meaningful feature, bug fix, or cross-cutting change:

```text
.specify/specs/001-short-name/
├── spec.md
├── plan.md
├── tasks.md
└── convergence.md
```

Use `pnpm speckit:new -- "short name"` to create the next numbered feature
directory. Do not put generated client code, secrets, runtime logs, or
conversation transcripts here. These documents capture intent and decisions,
not implementation output.
