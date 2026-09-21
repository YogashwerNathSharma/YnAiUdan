# YnAiUdan Autonomous Factory v2

## Objective

YnAiUdan is being evolved from a universal agent framework into a **requirement-to-result execution platform**. The user can provide a complete requirement set once; YnAiUdan compiles it into a dependency-aware product plan, delegates specialist work, executes in controlled environments, verifies independently, repairs failures, records provenance, and only then presents a releasable result.

This is intentionally **model-agnostic**. GPT-6 Astra can be used as a reasoning/coding/computer-use provider, but it is not the product architecture. A model is replaceable; the orchestration, memory, tools, verification, project intelligence and delivery contract remain YnAiUdan capabilities.

## Astra-parity capability envelope

The target envelope includes:

- long-horizon task planning and continuation
- computer/browser execution with permission boundaries
- coding, debugging and refactoring
- multimodal input/output
- document and presentation production
- research and source-aware synthesis
- persistent project context
- artifact creation instead of answer-only responses
- self-checking and correction loops
- explicit stop/ask behavior for risky actions

## YnAiUdan differentiation

The architecture should add capabilities around the model rather than try to become a single giant model:

1. **Requirement Compiler** — converts one large requirement dump into atomic requirements, acceptance criteria, dependencies, ambiguities and delivery targets.
2. **Factory Orchestrator** — creates architecture, implementation, integration, verification, release and operations phases.
3. **Multi-model federation** — routes reasoning, coding, vision, media, embeddings and speech to different providers/models.
4. **Independent Verification** — the verifier is not the same logical step as generation; release requires evidence.
5. **Failure Learning** — failure fingerprints and verified recovery strategies become reusable project intelligence.
6. **Artifact Provenance** — every meaningful artifact has a hash, source step and verification state.
7. **Safe autonomy** — external side effects, deployment and destructive changes remain explicit approval gates.
8. **Project Constitution** — architecture decisions, conventions and user instructions persist across tasks.
9. **Evaluation Harness** — parity and regression scenarios are repeatable instead of being judged by demos.

## Required lifecycle

```
Requirement dump
  -> Requirement compiler
  -> Architecture + dependency graph
  -> Specialist work waves
  -> Controlled execution
  -> Independent review
  -> Repair/re-plan
  -> Regression verification
  -> Release/deploy approval
  -> Operational memory
```

## Completion contract

A task has four separate states:

- **generated** — requested artifact was produced
- **executed** — the artifact or workflow was actually run
- **verified** — independent checks support correctness
- **releasable** — verification passed and all required approvals exist

Generation alone is never treated as completion.

## Benchmark protocol

Do not claim "better than Astra" from architecture alone. Run the same scenarios with the same requirements, tools, permissions and acceptance criteria.

Track:

- task completion rate
- first-pass success
- repair count
- verification pass rate
- unsupported claims
- tool-call efficiency
- time to verified result
- artifact correctness
- regression rate
- human approval burden
- cost/usage

The target is to demonstrate a measurable advantage in the **system workflow**, while using frontier models as interchangeable components.

## Current implementation audit

The existing repository already contains strong foundations: provider abstraction, universal intent detection, specialist routing, coding loops, GitHub engineering flows, sandboxing, task queues, persistent memory/learning, execution evidence, and verification gates.

The main gaps are orchestration cohesion and delivery semantics: the previous universal plan did not fully model a product-factory lifecycle, the web client exposes mostly chat, and the completion contract is distributed across several modules rather than represented as one factory-level object.

v2 introduces a shared factory plan so future UI/API work can expose one consistent lifecycle.

## Non-negotiable engineering rules

- Never bypass tenant/project boundaries.
- Never treat model output as proof.
- Never deploy unverified artifacts.
- Never silently perform destructive external actions.
- Preserve a checkpoint before major refactors.
- Keep provider/model selection replaceable.
- Record architecture changes and verification evidence.
