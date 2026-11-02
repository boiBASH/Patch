# Patch: an AI coding and security teammate

**Team:** Naija AI

**Project:** Release Detective

**Track:** Build

**Evidence date:** 7 October 2026

## Problem and role

While building iVoucher, we repeatedly investigated failures across application code, access controls, build configuration and infrastructure. Understanding the problem, reproducing it, preparing a safe fix and collecting verification evidence cost engineering attention.

Patch takes the role of a coding and security teammate for a defined API-exposure scenario. A native floating dog lives beside VS Code. It gives local security tips and runs an investigation that produces a reviewable candidate and evidence. Engineers retain policy decisions and release authority.

## Why the manual work matters

GitHub reports a 90-minute median for manual remediation of certain CodeQL pull-request alerts, versus 28 minutes with its AI assistance. Those 2024 observations provide industry context, not a Patch benchmark. [Source 1](https://github.blog/news-insights/product-news/secure-code-more-than-three-times-faster-with-copilot-autofix/)

The manual task includes understanding roles and checking unauthenticated and unauthorized requests. OWASP documents those checks and recommends maintaining an authorization matrix with automated integration tests. Patch automates a bounded subset of that work. [Source 2](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema/), [Source 3](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)

## The teammate's execution loop

1. **Trigger:** an engineer chooses Investigate from Patch or the Command Palette.
2. **Context:** local tools collect the approved scenario and HTTP observations.
3. **Reason:** AI interprets sanitized findings and selects from an approved action list.
4. **Act:** tools apply the selected repairs to a separate candidate. The AI cannot issue arbitrary commands.
5. **Verify:** unchanged probes test the candidate. The project-copy recipe also builds, tests, audits dependencies and scans source.
6. **Report:** Patch shows PASS or HOLD and opens the diff and evidence for human review.

The [architecture diagram](ARCHITECTURE.md) shows the local process and the AI boundary. An authenticated loopback bridge connects the VS Code extension to the native pet. Keys stay in the extension/backend. Model context excludes source code, credentials and real records. Actual transport metadata remains in technical evidence.

## Demonstrated scenario and results

The recorded code investigation uses an isolated copy of the iVoucher facilities route. The working route was already protected. The demonstration deliberately removes authentication and public-field selection only in the copy, then tests the regression with real Express routes and JWT/account middleware. Database responses are synthetic.

| Observation | Result |
| --- | --- |
| Recorded engine runtime | **81,999 ms, approximately 82 seconds** |
| Initial exposure checks | **12 failed out of 20** |
| Candidate exposure checks | **20/20 passed** |
| Full API suite, including those exposure checks | **92/92 passed** |
| Shared, API and web builds | **Passed** |
| Pattern-based source secret scan | **Passed, 85 files** |
| Original source | **Unchanged** |
| Overall release gate | **HOLD: dependency advisories remain** |

Eight production dependency advisories remained. The demonstration did not deploy anything. Human review and dependency remediation are outside the 82-second measurement.

A separate, smaller synthetic policy rehearsal took **5.188 seconds from command to completion**, with **36/36 checks passing** after five approved policy repairs. Each timing is one observed run, not a performance benchmark. The two-minute edited video is a presentation of the work, not the runtime measurement. See [measurement summary](MEASUREMENTS.json).

## Potential developer time saved

For the smaller sandbox only, assume 15-30 minutes of manual work and 2-5 minutes of human review after Patch's measured 5.188-second run. Assisted work would take **2.09-5.09 minutes**, implying **9.91-27.91 minutes potentially saved**, rounded to **about 10-28 minutes per investigation**.

These durations are planning assumptions. No cited source establishes our 15-30 minute baseline, and no person has yet been timed completing the same task unaided. The larger code investigation has no measured manual comparator. Weekly savings depend on actual task frequency, which we have not measured.

The next evaluation should time matched manual and assisted tasks from the same starting state, include review and rework, counterbalance task order, and compare both completion time and correctness. The fuller calculation is in [TIMING.md](../TIMING.md).

## Five acceptance checks

1. Patch starts an investigation from VS Code and collects real local HTTP observations.
2. AI chooses only actions supported by the observed findings.
3. Tools create a distinct candidate and preserve the original source or fixture.
4. Independent verification detects partial fixes, tampering, errors and unresolved blockers.
5. The engineer can review the actual diff and report, with no automatic deployment.

The prototype's own release gate passed **57 automated tests**, both dependency audits with zero vulnerabilities, a 53-file source scan, and native pet checks. This is separate from the dependency advisories in iVoucher. [Verification history](../VERIFICATION.md)

## Reflections and next work

**What worked:** the pet kept the investigation in the editor. Bounded actions made the fix inspectable. The gate retained dependency findings even after the exposure checks passed.

**What failed and changed:** an initial Windows drive-letter mismatch interfered with the test mock identity; canonical paths fixed it. The model schema initially allowed irrelevant repairs; the action list now follows the actual findings. Credential lookup originally depended on the checkout folder name; project identity now supports a fresh clone.

**Trust:** we trust the stated checks within this recipe, not an AI claim that the whole system is secure. Local heuristic warnings can be false positives. A human reviews the patch and remaining risk. The recorded gate stayed HOLD.

**Remaining scope:** validate against an authorized staging environment and real database, expand beyond the narrow facilities recipe, resolve dependency advisories in the application, and measure a matched human baseline. The prototype does not inspect cloud IAM or autonomously approve releases. Model cost was not measured, so no cost-saving claim is made.

## Materials

- [Slide deck PDF](Patch-Submission.pdf)
- [Editable slide deck](Patch-Submission.pptx)
- [Architecture diagram](ARCHITECTURE.md)
- [Sources and their limits](SOURCES.md)
- [Sanitized measurement summary](MEASUREMENTS.json)
