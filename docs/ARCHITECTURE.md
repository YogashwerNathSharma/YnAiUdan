# YnAiUdan Universal AI Architecture

## Mission

YnAiUdan is a domain-independent universal AI work platform. ERP is only one possible application. The platform must be able to understand goals, plan work, write and execute software, work across programming languages, research, manipulate data and documents, use authorized computer/web tools, create multimodal media, verify results, recover from failures, and return evidence-backed outcomes.

## Independence

YnAiUdan remains completely independent from any single third-party AI product or model. Model providers are replaceable behind provider interfaces. The platform's intelligence comes from orchestration, memory, tools, execution, verification, and specialist agents rather than hard-coding one model as the product.

## Runtime architecture

```text
User Goal
   |
   v
Universal Intent + Requirement Compiler
   |
   v
Master Orchestrator
   |
   +--> Reasoning / Planning
   +--> Project + Long-Term Memory
   +--> Specialist Agents
   |      +--> General Code Agent
   |      +--> Language/Compiler Agent
   |      +--> Research Agent
   |      +--> Computer Agent
   |      +--> Data Agent
   |      +--> Document Agent
   |      +--> Image Agent
   |      +--> Video Agent
   |      +--> Audio Agent
   |      +--> Web / API / Database / Platform Builders
   |      +--> Refactor Agent
   |      +--> Verify Agent
   |
   +--> Tool Gateway + Permission/Risk Layer
   |
   +--> Sandboxed Execution
   |
   v
Independent Critic / Test / Verification
   |
   +--> Pass --> Evidence + Result
   |
   +--> Fail --> Diagnose --> Re-plan --> Re-execute
```

## Universal capabilities

- General software engineering rather than ERP-specific coding.
- Multi-language understanding across common programming languages and the ability to adapt to new languages from their syntax, documentation, compiler/runtime, and tests.
- Code execution in isolated environments with resource and permission limits.
- Test generation, compilation, linting, regression checks, performance checks, and evidence capture.
- Browser/computer interaction through explicit tool permissions.
- Research with source-aware synthesis.
- Data analysis and transformation.
- Document, presentation, spreadsheet, and PDF workflows.
- Image, video, and audio generation/editing workflows through provider abstractions.
- Multi-agent decomposition for complex requests.
- Failure fingerprinting, recovery, re-planning, and repeated-failure guards.
- Persistent project intelligence and experience learning.
- Human approval gates for destructive or high-risk actions.

## Result contract

A completed task should be considered successful only when the requested artifact/result exists and the verification layer has sufficient evidence. The system should distinguish `generated`, `executed`, `verified`, and `approved` states instead of treating generation alone as success.

## Security boundaries

- Public APIs remain versioned.
- Secrets never enter frontend bundles or source control.
- Tool execution passes through permission/risk checks.
- Arbitrary code runs only inside controlled sandboxes.
- Destructive external actions require explicit capability and approval.
- Long-running jobs run in workers rather than request lifecycles.
- Every autonomous task is observable, auditable, and recoverable.

## Development sequence

1. Universal foundation and provider abstraction
2. Universal intent + master orchestrator
3. General coding and multi-language engine
4. Sandboxed execution + verification/evidence loop
5. Research + browser/computer tools
6. Data + document workflows
7. Image + video + audio pipelines
8. Persistent memory + project intelligence
9. Autonomous multi-agent execution and recovery
10. Evaluation, security, performance, and production hardening

## Development rules

1. Inspect the latest `main` before changes.
2. Preserve existing work.
3. Never force-push or reset shared history.
4. Never commit secrets.
5. Verify builds/tests before declaring work complete.
6. Keep high-risk external actions permission-controlled.
7. Prefer reusable universal capabilities over domain-specific implementations.
