# AI session records

- [transcript/](../transcript/README.md) is the AI session export: the visible user and agent messages from both Claude Code threads, in time order.
- [codex-review.md](codex-review.md) is the Codex (`gpt-6-luna`) review of the failing test suite, findings C1–C12.
- [break-report.md](break-report.md) is the adversarial pass that tried to break the failing-test scaffold, bugs B1–B21.
- [PROCESS.md](../PROCESS.md) records the workflow, human gates, interventions, and how each review finding was handled.
- [docs/verification.md](../docs/verification.md) records commands and observed outputs used to verify the running app.
- [The feature research record](../specs/001-url-shortener/research.md) records implementation decisions and rejected alternatives.

The two review files are unchanged copies from `.superpowers/sdd/tasks/`, the gitignored working folder used during execution. Paths they mention under `.superpowers/` point to scratch files that are not in the repository.
