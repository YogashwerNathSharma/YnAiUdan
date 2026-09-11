# YnAiUdan execution sandbox

YnAiUdan supports two execution backends:

- `process` — local-development fallback. Commands run as host processes with policy checks. This is **not** a security boundary.
- `container` — production execution backend. Commands run in a short-lived Docker container with network disabled, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, non-root UID, CPU/memory/PID limits, and a writable tenant workspace mount.

## Build the sandbox image

From the repository root:

```bash
docker build -t ynaiudan/sandbox:latest infra/sandbox
```

## Production configuration

Set:

```text
EXECUTION_BACKEND=container
SANDBOX_IMAGE=ynaiudan/sandbox:latest
WORKSPACE_ROOT=/var/lib/ynaiudan/workspaces
```

The API process needs permission to invoke Docker and the workspace root must be dedicated to YnAiUdan execution workspaces. Do **not** mount the Docker socket into the sandbox container itself.

## Isolation contract

Each execution gets a disposable container with:

- `--network=none`
- `--read-only`
- `--cap-drop=ALL`
- `--security-opt=no-new-privileges:true`
- `--user 10001:10001`
- `--memory=512m`
- `--cpus=1`
- `--pids-limit=128`
- writable `/workspace` only
- a 120-second application-level wall-time limit
- a 200,000-character combined stream limit per output stream

The process backend remains useful for local development, but production deployments should use `EXECUTION_BACKEND=container` and fail deployment checks if the container runtime is unavailable.
