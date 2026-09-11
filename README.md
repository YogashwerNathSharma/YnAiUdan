# YnAiUdan

YnAiUdan is a production-grade, domain-independent Universal AI Work Platform designed to turn natural-language goals into verified results. It is not an ERP AI; ERP is only one possible workload among many.

## Vision

YnAiUdan should be able to:

- understand complex goals and break them into executable work;
- reason, plan, critique, re-plan, and recover from failures;
- write, understand, execute, debug, refactor, and verify software;
- work across major programming languages and adapt to new languages using their syntax, documentation, compiler/runtime, and tests;
- research the web and synthesize source-aware results;
- use authorized browser and computer tools;
- analyze data and work with databases;
- create and transform documents, presentations, spreadsheets, and PDFs;
- orchestrate image, video, and audio generation/editing;
- maintain project intelligence and learn from verified experience;
- provide evidence for completed results rather than claiming success after generation alone.

## Core architecture

```text
User Goal
   -> Universal Intent
   -> Master Orchestrator
   -> Specialist Agents + Tools
   -> Sandboxed Execution
   -> Independent Verification
   -> Evidence-backed Result
```

Current specialist routing includes general coding, language/compiler understanding, research, computer use, data, documents, image, video, audio, web, Android, API, database, refactoring, and verification capabilities.

## Independence

YnAiUdan is an independent project. It does not use, import, modify, or depend on the existing ERP repositories, databases, routes, environment variables, or infrastructure. AI model providers are abstracted so no single third-party model is the product's architectural dependency.

## Current universal foundation

- React + TypeScript frontend
- Node.js + TypeScript API
- versioned API architecture
- provider abstraction
- conversation/project/task foundations
- universal capability routing
- universal intent and multimodal planning layer
- security-first configuration
- controlled agent execution and verification foundations
- testing and CI foundation

## Development rules

1. Inspect the latest `main` before changes.
2. Preserve existing work.
3. Never force-push or reset shared history.
4. Never commit secrets.
5. Verify builds/tests before declaring work complete.
6. High-risk external actions remain permission-controlled.
7. Build reusable universal capabilities rather than hard-coding the platform to one domain.
