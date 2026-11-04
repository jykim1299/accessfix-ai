# Before any future public deployment

This checklist is preparation, not approval to publish. RC1 is local only.

- Obtain the owner's approval of the UI, explanations, selected public evidence and overall project licensing.
- Deploy only the verified `dist/` output. Do not upload the development checkout, `.git`, environment files, node_modules, private traces, local QA logs or runtime directories.
- Verify all evidence against the curated manifest; keep model IDs, historical acceptance/rejection and remaining-review limitations unchanged.
- Confirm no API credentials, session tokens, personal local paths, raw private requests/responses or company material appear in the source or static output.
- Preserve the separate labels for original public files and derived presentation exports; retain applicable licenses and attribution.
- Retain static-only hosting. Do not add proxy functions, analysis/repair/restore/upload/admin endpoints or backend credentials.
- Configure equivalent Content-Security-Policy, X-Content-Type-Options, Referrer-Policy and clickjacking protections on the chosen host. The local Python server's headers do not automatically configure another host.
- Confirm non-GET/HEAD mutation/execution requests cannot run code or change files. Configure immutable deployment artifacts and prohibit directory listings.
- Check relative assets and hash routes under the actual hosting subpath; verify evidence downloads, images and patch text.
- Repeat responsive, keyboard, axe and JavaScript checks against the deployed version after publication is separately authorized. Preserve incomplete findings and do not call missing measurements passed.
- Link the approved public URL from the final README only after the user reviews and authorizes it.

No publication, upload, GitHub push, YouTube action or hackathon submission is included in RC1.
