# Connected sandbox investigation: five acceptance checks

Scope: one bundled facility API scenario on isolated loopback servers. The floating pet is the entry point. AI interprets evidence and selects approved repairs. This milestone covers the local prototype and excludes submission administration.

| Check | Acceptance condition | Evidence |
| --- | --- | --- |
| 1. Trigger and collect context | Investigate sandbox starts one investigation and collects all 36 real HTTP observations. The baseline has five findings and 32 failed checks. | Pet bridge integration test; native connection and extension command rehearsal; baseline evidence. |
| 2. Reason from evidence | The AI receives the bundled policy, findings, expected/observed HTTP results and permitted actions. Active editor source, real records, local paths and credentials are excluded from model context. A validated plan is returned. | Provider contract tests; model-context.json; live rehearsal. |
| 3. Perform a bounded action | The runner writes a separate candidate policy and a five-operation patch. The original fixture stays unchanged. Unknown actions stop the workflow. | baseline-policy.json, candidate-policy.json, patch.json; validation tests. |
| 4. Verify independently | The runner reads the saved candidate and repeats the same 36 checks. PASS requires complete matching evidence; partial fixes, cancellation and failures remain HOLD. | Candidate verification; incomplete-plan and cancellation tests. |
| 5. Report for human review | The pet reports before/after results. Review fix opens the actual policy diff and report in VS Code. Evidence includes measured execution time and limitations. Changed candidate files invalidate review. | Extension-host review rehearsal; report.md, evidence.json; integrity test. |

All five passed in the packaged extension's live rehearsal on 2026-10-07. See `data/connected-demo-verification.json`, run `b6a03b53-cb39-4ba3-ab06-d3c7c32de0d9`. The AI command took 5.188 seconds; human review was not timed.

## Rehearse the scenario

1. Open `companion/examples/security-demo.js` in VS Code. Local source warnings are heuristic reminders. Investigate explicitly targets the bundled sandbox, not the current file or production.
2. Click **Investigate sandbox** on the pet, or run **Release Detective: Investigate Sandbox API with AI**. Explain remains a separate generic advice feature.
3. Observe context, detection, reasoning, candidate preparation, verification and report progress. The companion uses the neutral label AI investigation; technical provider metadata stays in evidence.json.
4. Click **Review fix** after completion. Inspect the actual diff and the 36/36 verification evidence. A PASS requires human review and does not approve deployment.
5. Open full evidence from the pet's right-click menu or **Release Detective: Open Investigation Evidence**.

The original sandbox milestone is retained as a regression scenario. The submission recording additionally demonstrates the isolated iVoucher code workflow described below.

## Real code milestone

- `src/project-lab.mjs` creates an isolated copy, seeds a labelled authentication/field-projection regression, and creates a local review branch.
- The actual iVoucher route and JWT/account middleware are exercised with synthetic database responses. Both route aliases have 20 checks; the controlled baseline fails 12.
- Only two bounded TypeScript edits are supported. The same verifier, full application build and full API suite run on the candidate.
- The dry run on 2026-10-07 built shared/API/web, passed 92/92 API tests and 20/20 exposure probes, and passed the 85-file source secret scan. Dependency advisories kept the release on HOLD. This is correct gate behavior, not a release approval.
- Artifacts are stored in `data/project-runs/`. The live recording run is identified in `data/submission-video/recording-manifest.json` after recording is complete.
- The 0.5.3 prototype gate covers 54 automated tests plus the native pet self-test and both prototype dependency audits. The application's dependency findings are separate and remain visible.

## Failure walkthrough without paid requests

- **Release Detective: Investigate Sandbox API with Offline Playbook** runs the same tools with a labelled deterministic plan.
- Automated tests exercise partial fixes, unknown actions, cancellation, malformed provider output, protected bridge access and candidate tampering.
- Editing a candidate invalidates its stored verification when Review fix is invoked again. Start a new investigation; do not treat a modified file as verified.
- Production systems, real iVoucher permissions, IAM, arbitrary repositories and CI promotion are outside this scenario. The prototype's own security gate is separate from the candidate's 36 checks.
