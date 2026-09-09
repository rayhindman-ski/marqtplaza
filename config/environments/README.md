# Application environments

Environment-specific application configuration lives under:

- `tst/` — test configuration
- `acc/` — acceptance configuration
- `prd/` — production configuration

Each environment contains:

- `application.properties` — non-sensitive, version-controlled settings.
- `application.secrets` — local secret names and values. This file is ignored by Git and must never be committed.

At runtime, secret values belong in Replit Secrets and are exposed to the application as environment variables. Replit separates variables into `development`, `production`, and `shared` scopes. Use the application environment selector to distinguish `tst` and `acc` when both run in Replit's development scope; map `prd` to Replit's production scope.

Secret files in this directory are local stubs only. Keep their values empty in the workspace and populate `GITHUB_REPO_ACCESS_TOKEN` through Replit's secure secret form.