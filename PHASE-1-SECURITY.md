# YnAiUdan Phase 1 Security Boundaries

## Workspace isolation
- Workspace storage is scoped to tenant and authenticated user.
- Relative paths are rejected when absolute or containing `..` segments.
- Coding inspection uses the same scoped workspace boundary.

## Tool authorization
- Every registered tool declares permissions.
- Tool execution no longer bypasses permissions for LOW-risk tools.
- Tool context carries tenant, user, and optional project identity.

## Terminal
- Only allowlisted development executables can run.
- Terminal execution requires tenant and user context.
- The process working directory is the scoped workspace.
- The child process receives a minimal environment instead of all server secrets.

## GitHub
- Repository paths and refs are validated.
- Direct modification of protected branches is denied.
- Push is OWNER-only.
- GitHub write operations require the repository to be listed in `GITHUB_ALLOWED_REPOSITORIES`.
- GitHub commit creation updates the target branch ref so the commit is reachable.

## API
- JWT secret is mandatory and must be at least 32 characters.
- Validation failures are returned as HTTP 400.
- Unexpected errors are logged server-side and return a generic HTTP 500 response.
- Diagnostic endpoints for tools, models, metrics and provider health require authentication.

## Agent task execution
- Queue workers preserve the task owner's role instead of executing every task as `AGENT`.
- Task owner tenant/user/project context is propagated into tool execution.
- Persisted task autonomy modes are normalized to runtime autonomy modes.
