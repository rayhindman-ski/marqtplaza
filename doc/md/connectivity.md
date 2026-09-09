# System connectivity

## Configuration and secret locations

Non-sensitive environment properties are stored in:

```text
config/environments/
├── tst/application.properties
├── acc/application.properties
└── prd/application.properties
```

Local secret-file stubs use the same structure:

```text
config/environments/
├── tst/application.secrets
├── acc/application.secrets
└── prd/application.secrets
```

`application.secrets` files are excluded from Git. Their committed equivalent must never contain credentials. Runtime secrets are configured in Replit Secrets and read through environment variables.

## Replit ↔ GitHub

| Direction | Purpose | Protocol | Authentication |
| --- | --- | --- | --- |
| Replit → GitHub | Clone, fetch, pull, push, and repository automation | HTTPS using the GitHub API and Git smart HTTP | `GITHUB_REPO_ACCESS_TOKEN` from Replit Secrets |
| GitHub → Replit | Repository imports or explicitly configured automation/webhooks | HTTPS | Replit/GitHub authorization or a separately configured webhook secret |

The repository URL is non-sensitive and is defined as:

```properties
GITHUB_REPO_URL=https://github.com/rayhindman-ski/marqtplaza
```

Access tokens must not appear in source files, documentation, logs, command arguments, or browser code. Grant the replacement token only the repository permissions required by the intended operation.

## Replit → website

### Client

The Replit web workflow runs the `buurtgids` frontend. Users access it through Replit's HTTPS proxy and artifact route. Browser traffic terminates at the Replit proxy and is forwarded to the frontend service.

```text
Browser
  └─ HTTPS → Replit proxy/artifact route
               └─ HTTP → buurtgids web workflow
```

### Server

The frontend calls the API through the same Replit-hosted origin and routed API path. Replit forwards those requests to the `api-server` workflow. Application code must use routed, relative API paths rather than hardcoded localhost or development-domain URLs.

```text
Browser frontend
  └─ HTTPS /api/* → Replit proxy
                       └─ HTTP → api-server workflow
```

The server reads sensitive configuration from environment variables supplied by Replit Secrets. Secrets are never sent to the browser unless a variable is explicitly designed and restricted for public client use.

## Website → external services

| Caller | External service | Purpose | Authentication location |
| --- | --- | --- | --- |
| API server | OpenStreetMap/Overpass | Business and location discovery | No application credential; outbound server request policy applies |
| Browser | Map provider or generic map tiles | Render the interactive map | Public browser key only when explicitly configured and browser-restricted |
| API server | OpenAI integration | AI-assisted server features | Replit-managed server secret/integration |
| Browser and API server | Clerk | User authentication and session validation | Publishable key in the client; secret key only on the server |
| API server | GitHub | Repository operations, when enabled | `GITHUB_REPO_ACCESS_TOKEN` in Replit Secrets |

Google Places discovery is currently disabled because its configured permanent request allowance is exhausted.

## Trust boundaries

1. The browser is untrusted. It may send only validated application input and must never receive server secrets.
2. The API server validates requests before database or external-service access.
3. Outbound service calls originate from the server unless the service explicitly requires a browser-restricted public key.
4. Replit Secrets is the source of truth for credentials. Git-tracked properties contain only non-sensitive values.
5. Environment-specific credentials must use the appropriate Replit scope and must not be copied between `tst`, `acc`, and `prd` without an explicit access decision.