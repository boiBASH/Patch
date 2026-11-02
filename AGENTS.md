# Project Instructions

## Security validation

- Treat vulnerability and exposure testing as a required release gate for every build.
- Run automated security checks appropriate to the change, including dependency audit, secret scanning, authentication and authorization checks, public data-exposure checks, and security-header validation.
- For public-facing or security-sensitive changes, perform authorized, non-destructive penetration testing against a staging environment or zero-traffic candidate revision before production promotion.
- Never run intrusive or destructive penetration tests against production or third-party systems without explicit written authorization and an agreed test window.
- Report the tested scope, findings, fixes, verification results, and residual risks with each deployment.
