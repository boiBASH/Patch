# Prototype verification

Date: 2026-10-07. Environment: Windows, Node.js 24.13.0, VS Code 1.140.0, Tk 8.6.12.

The prototype verification history is below. Version 0.5.3 additionally tests an isolated iVoucher copy; the original working application files and production services remain outside the mutation scope. Generated `data/` evidence and video files are local artifacts and are excluded from the source repository.

## Current project-copy milestone

On 2026-10-07, packaged Patch 0.5.3 was installed into a clean VS Code profile. Computer Use started **Investigate iVoucher Project Copy with AI** and opened **Review Candidate Fix**. The live run `5f442a32-359d-4a57-9644-ba1aae74b250` finished in 81,999 ms with a validated two-action AI plan and an actual TypeScript diff. Shared/API/web built; 92/92 API tests and 20/20 exposure checks passed; the 85-file source secret scan passed. The original route hash remained unchanged.

The overall gate is **HOLD**, with dependency advisories as the sole blocker. Full audit: 22 advisories (3 critical, 5 high, 13 moderate, 1 low). Production audit: 8 (1 critical, 2 high, 5 moderate). No dependency fixes, production testing or deployment are claimed.

The prototype's own build gate passes 54 automated tests, both dependency audits and native pet checks. A Windows drive-case mismatch caught by the GUI rehearsal was fixed before the final run; the model schema was also narrowed to actions relevant to the observed findings. Unsupported model actions still fail closed. The source/baseline and model context are inspectable under `data/project-runs/`. Real source, credentials and records were not sent to the model.

The two-minute silent video and timed narration script are under `data/submission-video/`. Actual window captures are edited to shorten waits and hold review views. The revised recording distinguishes observed runtime from estimated potential savings. Staging validation remains outstanding.

## Automated release gate

### Patch presentation and configuration, companion 0.5.5

On 2026-10-07, the release gate passed 57 tests (37 engine/server and 20 companion), both dependency audits with zero vulnerabilities, the 53-file source secret scan, and native widget/sprite checks. The new tests verify neutral `AI_API_KEY`/`AI_MODEL` settings and compatibility with existing settings. A blank env value cannot consume the following line. Documentation now introduces Patch, separates the measured 82.0-second code run from the 5.188-second sandbox run, and labels the potential 10-28 minute sandbox saving as an estimate. The revised video uses the existing screen captures and factual results, with updated captions and narration. Technical model evidence remains unchanged. No new model call, staging test or deployment occurred for this update.

### Standalone repository preparation, companion 0.5.4

The 2026-10-07 clean source checkout passed 55 automated tests (36 engine/server tests and 19 companion tests), both dependency audits with zero vulnerabilities, a 52-file pattern-based source secret scan, and the native widget/sprite checks. This run required no model key and made no model request. The added regression test covers `.env` lookup when the GitHub checkout folder has a different name, while preserving unrelated-project boundaries. The project-copy CLI now accepts an explicit local `--project-root`; the TypeScript probe template is included in source secret scanning. No production deployment or new project-copy run was performed for these portability changes.

### Reproduce the gate

Run `npm.cmd run build` in this directory. The gate checks JavaScript syntax, audits the local dependency lockfile, scans prototype source for common credential patterns, and runs the security and provider-contract tests. The generated `data/build-verification.json` is initialized to HOLD and becomes PASS only after every step succeeds.

The suite verifies baseline exposure, each independently omitted remediation, all 36 candidate HTTP checks, approved-user access, forbidden-role rejection, malformed and oversized requests, session requirements, Host/Origin protection, response headers, credential exclusion, invalid model output, incomplete verification, interrupted runs and report exports. AI transport is mocked in these automated gate tests. Separate live companion checks now exercise both generic explanation and the shared structured remediation planner.

## Earlier floating companion verification

The build gate also includes eighteen companion tests covering local rules, excluded files, secret-value omission, provider request boundaries, credential lookup, the authenticated loopback bridge, native process connection, and the connected investigation workflow. Together with the original 32 tests, 50 automated tests pass. Both package manifests have zero third-party dependencies and their npm audits report zero vulnerabilities. The source secret scan includes CommonJS and Python files.

Native Tk self-tests load the generated robot and exercise finding/snooze widgets. A real VS Code Extension Host test verifies activation, three diagnostics from a synthetic document, source-content exclusion, and launch/authenticated polling by the native pet. Results are saved to `data/companion-vscode-verification.json`. The standard VSIX package uses an explicit runtime-file allowlist; environment files, test code and local reports are excluded.

The extension was installed through the VS Code CLI and the example opened in a new editor window. Initial Computer Use inspection timed out, but a later session successfully reloaded the user's actual file-only window and visually confirmed the floating robot and tip bubble. The native process, widgets and editor connection are also verified automatically. Dragging and the pet's mouse buttons have not yet been exercised through Computer Use.

## Live AI verification

After the user supplied the local key, a generic authentication explanation succeeded with `openai/gpt-4.1-mini`, both through the companion adapter and through the actual VS Code Explain command. Reports are saved to `data/companion-live-ai-verification.json` and `data/companion-vscode-live-ai.json`. No source code, paths, or matched credentials were sent. The opt-in extension-host check lives in `companion/test/vscode-live-ai.cjs` and requires `RD_LIVE_AI_TEST=1`; normal tests never make a paid request.

Standalone Node initially rejected the network certificate chain. Using Windows' trusted certificate store resolved the connection without disabling TLS validation. The app's startup and AI CLI scripts now include `--use-system-ca`. VS Code's existing certificate handling worked without an extension runtime change.

Version 0.2.1 fixes credential discovery when only a file is open. The original workspace-only lookup reproduced the user's missing-key message in a fresh, folderless VS Code window. After the fix, the same live Explain test succeeded using the existing project `.env`, without an inherited environment key or copying the credential. Before/after reports are `data/companion-vscode-single-file-ai-before.json` and `data/companion-vscode-single-file-ai.json`. The lookup checks bounded active-file ancestry and stops at the nearest Release Detective project or Git boundary; regression tests also cover nested workspaces, rereading a changed key, and isolation from unrelated projects.

## Synthetic investigation evidence

Version 0.3.0 connects the native pet to the shared engine. A packaged-extension rehearsal in a real VS Code Extension Host passed all five acceptance checks using one live AI plan on 2026-10-07. It verified the native connection, full HTTP evidence supplied to the model, five changes written to a separate candidate, 36/36 checks against that saved candidate, and opening the actual diff and report. Results are in `data/connected-demo-verification.json`, run `b6a03b53-cb39-4ba3-ab06-d3c7c32de0d9`. Command duration was 5.188 seconds; engine duration was 5.152 seconds. Human review and historical manual time were not measured. Assumptions and their limits are in `TIMING.md`.

New negative tests cover concurrent-start deduplication, incomplete fixes, unsupported actions, cancellation, changed candidate files and attempts to pass arbitrary targets through the pet bridge. Candidate tampering forces HOLD when review integrity is checked. Artifacts contain no configured key, and the original fixture remains unchanged. The VSIX contains the engine and fixture through an explicit allowlist; keys, tests, workspace files and local data are excluded. Submission administration remains outside this milestone.

The installed 0.3.0 extension was reloaded in the user's existing file-only VS Code window. A UI-triggered offline rehearsal completed and its floating bubble visibly showed 32 baseline failures, 36/36 candidate passes, the offline provider label, and Investigate sandbox/Review fix/Tips controls. This visual check was separate from the live AI extension-host rehearsal and did not make another paid request.

- Baseline: five seeded policy findings, 32 failing checks out of 36.
- Candidate: all 36 checks pass after the five bounded policy corrections.
- Fixes: require authentication, restrict roles to PATIENT/ADMIN, return only id/code/name/type, add response protections, and restrict CORS to the synthetic approved origin.
- Both `/api/facilities` and `/facilities` are tested on isolated loopback servers.
- The gate remains HOLD for partial fixes, invalid plans, incomplete evidence and interrupted work.

## Provider-neutral presentation update

Version 0.3.1 uses AI investigation labels in the pet, progress messages, review report, command menu and optional dashboard. Offline runs remain explicitly labelled. Technical JSON evidence keeps the actual provider and model. The existing connected-workflow test confirms this distinction. All 50 tests, both dependency audits, the 43-file source secret scan and native widget checks passed again. The updated VSIX was installed and VS Code reloaded; the native process was confirmed running from 0.3.1. The user's existing report was regenerated and visually confirmed to show Mode: AI investigation, with its evidence JSON unchanged. No new live inference or deployment was performed for this presentation update.

## Patch companion update

Version 0.4.1 replaces the displayed robot with Patch, a pixel-art dog with a purple collar and a laptop. Twenty frames cover sniffing, alert, coding, wagging and sleeping. The native checks exercise busy stages, blocked results, verified results, snoozing, idle sleep, hover wake, transparent corners and visible sprite content. Only a passing sandbox result triggers the wag; local heuristic checks cannot do so. Windows display copies use binary alpha to avoid the color-key window's pink fringe; the original generated sprite sheet is preserved.

The final release gate passed all 50 automated tests, both dependency audits, the 46-file source secret scan and all native animation/widget checks. A real VS Code Extension Host test of the packaged Patch extension also passed activation, three expected diagnostics, source-content exclusion and authenticated native connection (`data/companion-vscode-verification.json`). The package includes the dog artwork and native animation module and excludes the old robot, keys, tests and local run data. The update was installed locally; no production deployment or new model request was needed.

## Limits

This is non-destructive local security validation, not penetration testing of a deployed service. The current project-copy milestone tests a narrow real-code recipe with mocked database access; real identity providers, cloud IAM, tenant isolation and production services have not been tested. The source scan covers common credential formats and is not exhaustive. The prototype has zero third-party packages; its own npm audit is separate from the project-copy audit of iVoucher. The dashboard is a single-user loopback tool and is not ready for public hosting. These verification runs did not deploy a service.
