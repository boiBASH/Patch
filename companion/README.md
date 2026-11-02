# Patch - Release Detective Companion

Patch is a draggable pixel-art dog with a purple collar and a tiny laptop that floats over **VS Code on Windows** and offers security advice while you work. The existing browser dashboard remains optional for the synthetic release investigation demo.

## Start

From the repository root, build the extension with Python and install the generated VSIX:

```powershell
python companion/scripts/package.py
code --install-extension data/packages/release-detective-companion-0.5.5.vsix
```

You can also select **Extensions: Install from VSIX** in VS Code. Reload VS Code if asked. In a trusted local workspace the pet starts automatically. Run **Release Detective: Show Patch** from the Command Palette or click **Patch** in the status bar.

The native window needs Python with tkinter. Set **Release Detective: Python Path** in user settings to a Python interpreter with tkinter, for example a standard python.org installation's `pythonw.exe`. A Codex bundled Python installation is also detected when available. This executable setting is application-scoped, not workspace-controlled. No Python packages or npm dependencies need to be installed for the companion.

## Pet controls

- Drag Patch to reposition it over VS Code.
- Hover or click to open its tip bubble.
- **Show line** takes you to the active finding in the editor.
- **Next** cycles through the current file's findings.
- **Explain** asks the AI service for a short educational explanation of the selected rule.
- **Investigate sandbox** runs the complete detect, reason, prepare, verify and report workflow for the bundled facility API. While running, the button becomes **Cancel investigation**.
- In the trusted iVoucher root, the button reads **Investigate copy** and runs the bounded real-code recipe in a separate copy. The explicit sandbox commands remain available.
- **Review fix** opens the saved before/after policy or TypeScript diff and the verification report in VS Code.
- **Tips** returns to active-file advice. The right-click menu also offers full evidence and an explicitly labelled offline playbook.
- **Snooze** pauses tip bubbles for 15 minutes. Clicking the pet wakes it.
- Right-click and choose **Hide Patch**, or run **Release Detective: Hide Patch**.

Patch sniffs during checks, perks up when findings need attention, types while the AI explains or prepares a fix, wags his tail after verified sandbox checks, and naps after 15 idle seconds or when snoozed. Hovering wakes him. His name and status badge remain visible. A wag means the candidate checks passed and human review is still required. Local scanning alone never triggers the celebration. New-finding bubbles have a 45-second cooldown. It follows the focused VS Code window, hides when you switch apps, and exits if its editor connection closes. Investigations write a separate synthetic candidate and reports, while source files remain unchanged. Auto-start applies only to extension activation in VS Code; there is no operating-system startup entry.

## What it checks

The extension checks the active supported file locally after an edit debounce or save. It adds VS Code diagnostics and tips for possible embedded credentials, broad CORS, disabled TLS verification, routes needing authentication review, unrestricted database field selection, unsafe SQL, dynamic shell calls, and exposed exception details.

These are bounded pattern-based heuristics. A route warning is a prompt to inspect middleware and authorization, not a confirmed vulnerability. Global middleware and application semantics can be missed, and false positives are possible. Absence of findings is never labelled safe or release-ready. Files over 250,000 characters, `.env`, generated output and dependencies are excluded. No background whole-repository crawl occurs.

## AI and the connected investigation

Version 0.5.3 also includes **Release Detective: Investigate iVoucher Project Copy with AI**. It reproduces a labelled regression in a source copy, tests the real facility routes and JWT/account middleware with synthetic database responses, and lets AI select two approved local code repairs. The copy builds shared/API/web, runs the full API suite, audits dependencies and scans source secrets. Project artifacts live under the workspace's `release-detective/data/project-runs/<id>/`. The original project stays unchanged. Existing dependencies are required and reused from the local installation.

The recorded live run passed 92/92 API tests, 20/20 exposure probes and all three application builds. The release correctly stayed HOLD because dependency advisories remained. This is a narrow facilities recipe; it does not patch arbitrary code, access production, approve releases or deploy. See the parent README and submission-video recording manifest for the scope and evidence.

The AI service interprets sanitized evidence through a bounded adapter. Technical evidence retains the actual transport and model used.

The packaged extension includes the same sandbox engine used by the optional dashboard. **Investigate sandbox** collects 36 real HTTP observations from an isolated synthetic API, sends that policy and evidence to the AI, validates the returned action list, writes a separate candidate, reads it back, and reruns the unchanged checks. A complete result is PASS with human review required; incomplete, failed or cancelled work stays HOLD. The AI cannot execute commands, choose another target or change the verifier.

Each investigation makes one bounded model request with a 45-second timeout and a 1,800-token response cap. There are no automatic retries or silent offline fallbacks. Repeated clicks share the same active run. Findings, progress and results reach the pet over its authenticated connection. **Review fix** opens the actual diff and report. Editing a saved candidate invalidates its review result when checked again.

Artifacts are stored in this extension's VS Code global storage under `investigations/<run-id>/`: baseline, candidate, patch, model context, report and full evidence. Active editor contents and real records are excluded. Review files are excluded from the active-file scanner, and opening them preserves the original project's credential context.

Local checks and tips work without a model or a key. The companion uses the existing `release-detective/.env` in an opened project, or the `.env` when the project folder itself is `release-detective`. Opening a single file also works: it follows that file's parent directories to the nearest Release Detective project or Git root. Lookup stops at that project boundary, the home directory, or 16 parent levels; it does not search unrelated folders. Use `AI_API_KEY` in `.env`; existing key configuration remains compatible. It reads the key fresh when Explain is clicked, so key edits require no restart. Installing an extension update still requires reloading an already-open VS Code window. Alternatively use **Release Detective: Set AI Service Key** to save the key in VS Code SecretStorage.

**Explain** sends a fixed generic security question; **Investigate sandbox** sends the bundled synthetic policy and HTTP findings. File contents, paths, repository names, matched credentials and private error logs are excluded from both requests. The native pet never receives the model key. Explain returns plain text with a 30-second timeout, a 400-token response cap, no automatic retries, and a short cooldown. Both live explanation and the complete packaged investigation have passed against `openai/gpt-4.1-mini`.

## Security and architecture

```text
Active editor -> local heuristic checks -> VS Code diagnostics
                         |
                 authenticated loopback bridge
                         |
                 native transparent Python window
                         |
       Investigate sandbox -> shared investigation engine
                         |
              HTTP evidence -> bounded AI plan
                         |
              saved candidate -> unchanged verifier
                         |
              pet result -> VS Code diff and report
```

The extension only activates in a trusted local window. Remote extension hosts and virtual workspaces are not currently supported. Its bridge binds an ephemeral port on 127.0.0.1, checks Host, rejects Origin/cross-site requests, requires a random session token, limits request size, and accepts only eleven named actions. Arbitrary targets, paths and commands are rejected. The token goes to the pet's environment, not command-line arguments; the pet polls without system proxies and refuses redirects. Source text is used only in the local scanner. The bridge exposes compact progress and findings, never the model key.

This companion supplements the release gate; it does not replace dependency audits, full secret scanning, staging exposure tests, real authentication/authorization tests, infrastructure review, or human review.

## Development

```powershell
# From the repository root:
cd companion
npm.cmd test
code --new-window --extensionDevelopmentPath="$PWD" "$PWD\.."
```

Open `examples/security-demo.js` for a synthetic three-finding walkthrough. It is a non-executable example. `test/vscode-integration.cjs` exercises the extension inside a real VS Code Extension Host. `native/pet.py --self-test` checks the actual Tk widgets and sprite loading without displaying a window. `scripts/package.py` packages only an explicit runtime file allowlist, excluding keys, tests, local data and workspace files.

## Artwork

`assets/patch-sprites.png` was created with the built-in image generator. It contains twenty frames in a four-column, five-row grid: sniff, alert, code, wag and sleep. The native loader extracts transparent cells at runtime with Tk; no additional Python packages are required. `assets/patch.png` is an exported alert frame used as the extension icon. The complete generation and cleanup prompts are in `assets/PATCH-ART.md`. The original robot asset is retained as prior artwork but is no longer packaged or displayed.
