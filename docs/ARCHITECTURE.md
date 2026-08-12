# YnAiUdan Architecture — Phase 1

## Boundaries

YnAiUdan is an independent application. No ERP repository, database, environment variable, route, or infrastructure is a dependency.

## Runtime boundaries

```text
Web (React/Vite)
       |
       v
API (Fastify /api/v1)
       |
       +--> Domain services
       +--> AI provider abstraction
       +--> Database (planned PostgreSQL + Prisma)
       +--> Queue/workers (later phases)
       +--> External tools through permission layer (later phases)
```

## Design rules

- Public APIs are versioned.
- Provider integrations are behind interfaces.
- Tool execution must pass through permission/risk checks.
- Secrets never enter the frontend bundle or source control.
- Long-running work belongs in workers, not the API request lifecycle.
- Destructive operations require explicit capability/approval.
- Every autonomous task must be observable and recoverable.

## Phase sequence

1. Foundation
2. Agent engine
3. Coding agent
4. GitHub agent
5. Web + Google
6. Media
7. Memory + projects
8. Autonomous execution
9. Production hardening
