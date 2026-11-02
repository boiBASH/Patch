# Meet Patch, your AI coding and security teammate

<img src="companion/assets/patch.png" alt="Patch, a pixel-art dog with a purple collar" width="160">

**Patch lives over VS Code, helps investigate API exposure, prepares a bounded fix, and verifies the candidate for an engineer to review.** Release Detective is the investigation engine behind Patch. Built by **Naija AI for DevX Arena 2026**, inspired by the repeated investigation work we faced while building iVoucher.

Engineers lose time gathering context, tracing access failures, checking configuration, and repeating release checks. Patch takes on a defined investigation and returns a code diff, test results, and remaining risks, so the engineer can focus on decisions that need judgment.

## What Patch does

- **Works beside your code.** A draggable dog floats over VS Code on Windows, offers security tips, and highlights possible risks in the active file.
- **Investigates exposure.** Local checks examine authentication, authorization, public response fields, security headers, and cross-origin access.
- **Prepares a fix.** AI interprets sanitized evidence and selects approved repairs. Local tools apply those repairs to a separate candidate.
- **Checks the result.** Independent checks verify the candidate; the project-copy recipe also builds the application, runs API tests, audits dependencies, and scans source for credential patterns.
- **Hands back evidence.** Patch opens the actual diff and report. Incomplete checks or unresolved blockers keep the release on **HOLD**. Human review is always required.

The optional browser dashboard and CLI use the same investigation engine. Patch is the primary developer experience.

## What we measured

These are two distinct live rehearsals on 7 October 2026, each with one observed run. Neither includes human review.

| Workflow | Measured time | Verified outcome |
| --- | ---: | --- |
| Isolated iVoucher code investigation | **82.0 seconds** | Two approved TypeScript repairs; shared/API/web builds passed; **92/92 API tests**, including **20/20 exposure checks**; original source unchanged |
| Smaller synthetic policy sandbox | **5.188 seconds** from command to completion | Five policy repairs; **36/36 exposure checks**; diff and report opened in VS Code |

The iVoucher copy's overall gate stayed **HOLD** because dependency advisories remained, including eight production advisories. The 82 seconds measures investigation and verification, not resolution of every release risk. The recorded exposure was deliberately reproduced in an isolated copy with synthetic database responses.

## How much developer time could Patch save?

**Estimated potential: about 10–28 minutes per bounded sandbox investigation, including human review.** This is a planning estimate, not an observed productivity result or a claim about a production incident.

| Comparison for the same smaller sandbox | Time |
| --- | ---: |
| Manual context gathering, checks, repair and evidence | **15–30 minutes assumed** |
| Patch's observed automated run | **5.188 seconds measured** |
| Engineer review after Patch finishes | **2–5 minutes assumed** |
| Total assisted workflow | **2.09–5.09 minutes estimated** |
| Potential saving | **9.91–27.91 minutes estimated** |

Calculation: manual time minus automated runtime and human review. The smaller saving pairs 15 minutes of manual work with 5 minutes of review; the larger pairs 30 minutes with 2 minutes of review. A timed manual comparison is still needed. These assumptions are separate from the larger 82-second code investigation. See [timing evidence and assumptions](TIMING.md).

## Submission materials

[Slide deck PDF](submission/Patch-Submission.pdf)

[Architecture diagram](submission/ARCHITECTURE.md)

[Markdown writeup](submission/WRITEUP.md)

The writeup includes cited context on manual security work. External benchmarks do not establish Patch's savings; our manual baseline remains an assumption. See [sources and claim boundaries](submission/SOURCES.md) and the [editable slide deck](submission/Patch-Submission.pptx).

## Try Patch

Requires Windows, VS Code, Node.js 24 or later, and Python with tkinter. The application and companion have no third-party npm dependencies.

```powershell
git clone https://github.com/boiBASH/Patch.git
cd Patch
Copy-Item .env.example .env
python companion/scripts/package.py
code --install-extension data/packages/release-detective-companion-0.5.5.vsix
```

Set **Release Detective: Python Path** in VS Code user settings to your Python interpreter if it is not detected. Open a trusted local workspace, reload VS Code, then run **Release Detective: Show Patch**. Local tips work without an API key. Use **Release Detective: Set AI Service Key**, or fill `AI_API_KEY` in the ignored `.env`, to enable explicit AI actions. See the [companion guide](companion/README.md).

For the optional dashboard, run `npm.cmd start` and open <http://127.0.0.1:4317>. **Demo · no API key** runs a clearly labelled deterministic playbook. **AI investigation** uses the configured AI service. Restart the dashboard after changing `.env`.

## Investigation flow

```text
Patch in VS Code / optional dashboard / CLI
                    |
             Gather local evidence
                    |
            AI selects approved actions
                    |
         Local tools prepare a separate candidate
                    |
          Independent checks + dependency gate
                    |
           Diff, evidence, PASS or HOLD
                    |
               Engineer review
```

The AI receives synthetic policy or sanitized check results. It cannot choose arbitrary commands, change the verifier, or deploy. Each investigation makes one bounded model request with a 45-second timeout and a 1,800-token response cap. There are no automatic paid retries or silent fallbacks to the offline playbook. The actual transport and model remain recorded in technical evidence.

## Commands and verification

```powershell
npm.cmd run build       # syntax, source secret scan, both audits, tests and native pet checks
npm.cmd test            # engine and local HTTP security tests
npm.cmd run security    # source secret scan and dependency inventory
npm.cmd run demo        # sandbox with offline playbook
npm.cmd run investigate # sandbox with AI
npm.cmd run investigate:project -- --project-root "C:\path\to\Ivoucher"
```

The current standalone repository gate passed **57 automated tests**, both dependency audits with zero vulnerabilities, the source secret scan, and native Patch checks. Details are recorded in [VERIFICATION.md](VERIFICATION.md). The prototype's dependency results are separate from advisories in the private iVoucher application. See [acceptance checks](ACCEPTANCE.md).

## Optional iVoucher project-copy recipe

This requires a separately authorized, compatible private iVoucher checkout and its installed dependencies. That application is not included here. The CLI accepts its path through `--project-root`; add `--offline` for the deterministic planner. For the companion's **Investigate copy** button, place this checkout at `<Ivoucher>/release-detective` and open the trusted iVoucher root in VS Code.

The runner creates an isolated source copy under `data/project-runs/`, reproduces two labelled regressions in the facilities route, and tests real Express routes and JWT/account middleware with mocked database responses. Approved repairs restore authentication and public-field selection. It then builds shared/API/web, runs the API suite, audits dependencies, and scans source. Existing dependencies are reused. The original checkout stays unchanged.

Full audit blocks high/critical advisories; production audit also blocks moderate advisories. **Review fix** opens the TypeScript diff and evidence, and rechecks the candidate hash. This is a narrow facilities recipe, not a general autonomous code fixer or comprehensive vulnerability assessment.

## Scope and repository contents

Local pattern warnings are review prompts, not proof of a vulnerability. Tests cover the defined sandbox or project-copy recipe, not production infrastructure, real identity providers, real records, or every endpoint. A passing candidate still requires human review; no automatic deployment occurs.

The dashboard is a single-user loopback service with session authentication, Host/Origin validation, and restrictive response headers. Model keys stay out of the pet, browser responses, review reports, and model context. Technical provider adapters remain inspectable in source.

This repository contains source, artwork, synthetic fixtures, tests, packaging scripts, and verification notes. Real keys, private iVoucher source/history, dependencies, recordings, and generated investigation data are excluded. References to `data/` describe local artifacts, not files bundled in a fresh clone.
