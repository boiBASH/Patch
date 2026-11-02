# Timing evidence and estimated value

No one has yet been timed completing the same investigation manually. The estimates below apply to the bounded sandbox exercise, not a production iVoucher incident.

## Measured live rehearsal

- Date: 2026-10-07. One sample, packaged VS Code extension 0.3.0, live AI investigation; model metadata is retained in the local evidence.
- Command-to-completion: **5.188 seconds**, including credential lookup and saving review artifacts. Native pet startup and human review are excluded.
- Engine execution: **5.152 seconds**: context 33 ms, detection 211 ms, AI reasoning 4,763 ms, candidate preparation 17 ms, verification 123 ms, report stage 5 ms.
- Result: five findings, 32/36 baseline failures, five candidate policy changes, 36/36 candidate checks passing. The native pet was connected; the actual diff and report opened successfully.
- Source: `data/connected-demo-verification.json`, with full evidence in `data/connected-demo-run.json`; run `b6a03b53-cb39-4ba3-ab06-d3c7c32de0d9`.

This is a single functional rehearsal, not a latency benchmark or an observed productivity study. Model/network conditions and larger scenarios can take longer. The 5.188-second duration does not include a human explaining the demo.

## Planning estimates, not measured savings

| Manual work for this sandbox | Assumed minutes |
| --- | ---: |
| Read the scenario and locate relevant policy | 3-5 |
| Collect and interpret exposure/access evidence | 5-10 |
| Prepare the candidate changes | 5-10 |
| Rerun checks and assemble evidence | 2-5 |
| Total manual workflow | **15-30** |

Assume **2-5 minutes of human review** after the agent's measured 0.0865 minutes. Under those assumptions, assisted work would take approximately **2.09-5.09 minutes**, implying **9.91-27.91 minutes potentially saved per sandbox investigation**. These are calculated estimates, not measured time savings. No weekly saving is claimed because actual investigation frequency is unknown.

For a defensible comparison, time a person doing the same scenario unaided, then time an assisted run including review. Record the same start/end conditions, experience level, errors, interventions and outcome; repeat before generalizing.

## Recorded real-code run - 2026-10-07

Patch 0.5.3 completed the isolated iVoucher code investigation in **81,999 ms (82.0 seconds)**. Run: `5f442a32-359d-4a57-9644-ba1aae74b250`, under `data/project-runs/`. This is a different, larger workflow than the earlier 5.188-second policy sandbox.

The model selected two permitted repairs from synthetic HTTP evidence. Shared/API/web builds passed; all 92 API tests passed, including the 20 exposure checks. The 85-file source secret scan passed. The overall release stayed on HOLD because dependency audits reported advisories, including 8 production advisories. Human review and dependency remediation were not timed.

The two-minute edited recording uses actual VS Code captures, shortens waiting periods and holds review views for narration. Its duration is not the measured engine runtime. No observed time-saving claim is made; the earlier 15-30 minute manual estimate remains an unmeasured planning assumption and is not evidence that all release risks can be resolved in that time.

## Published context for the human work

GitHub reported a median **90 minutes of manual remediation**, compared with **28 minutes using its AI assistance**, for new CodeQL pull-request alerts in May-July 2024 beta telemetry. Different tasks and measurement boundaries prevent treating this as Patch's baseline. [GitHub report](https://github.blog/news-insights/product-news/secure-code-more-than-three-times-faster-with-copilot-autofix/)

OWASP describes testing access across roles and unauthenticated requests, and maintaining an authorization matrix with integration tests. These sources support the work breakdown, not its duration. [Authorization testing](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema/), [Authorization automation](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)

The **15-30 minute manual estimate remains our assumption**. The cited evidence does not establish Patch's savings. The [source notes](submission/SOURCES.md) and [sanitized run summary](submission/MEASUREMENTS.json) distinguish published context, observed runtime and estimated benefit.
