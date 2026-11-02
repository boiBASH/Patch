# Sources and claim boundaries

Accessed 7 October 2026. External sources explain comparable work and context. They do not measure Patch.

| Source | What it supports | What it does not establish |
| --- | --- | --- |
| [1. GitHub, 14 August 2024, updated 21 January 2025](https://github.blog/news-insights/product-news/secure-code-more-than-three-times-faster-with-copilot-autofix/) | May-July 2024 beta data: median manual remediation of new CodeQL pull-request alerts was 1.5 hours; AI-assisted remediation was 28 minutes. | Patch's speedup or manual baseline. Vendor telemetry is not a controlled comparison with our scenario. |
| [2. OWASP WSTG v4.2, authorization testing](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/05-Authorization_Testing/02-Testing_for_Bypassing_Authorization_Schema/) | Review access by role, including unauthenticated access and privilege boundaries. | Minutes per test or complete coverage by Patch. |
| [3. OWASP, authorization testing automation](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html) | Define an access matrix, drive integration tests from it, and inspect the results at release time. | Our assumed 15-30 minute duration. |
| [4. NIST SP 800-218 v1.1, 2022](https://csrc.nist.gov/pubs/sp/800/218/final) | Integrate security practices into development and address vulnerability causes. | Certification, compliance, or measured productivity for this prototype. |

Our observed timings and results appear in [MEASUREMENTS.json](MEASUREMENTS.json). The smaller sandbox's 15-30 minute manual workflow and 2-5 minute review are planning assumptions. The 10-28 minute potential saving follows from those assumptions and the measured 5.188-second run. It is not a published benchmark.
