# Pre-Release Checklist

Before tagging a new release or merging a major update to `main`, ensure all these checks pass.

## 1. Safety & Secrets
- [ ] **No Secrets:** Run `grep` or a secret scanner to ensure no `.env` values, API keys, or personal paths are leaked in the codebase or examples.
- [ ] **Gitignore:** Ensure `.env`, `logs/`, and `data/` are still covered by `.gitignore`.
- [ ] **Ports:** Confirm default ports are still `43173` and `43174` on `127.0.0.1`.

## 2. Code Quality
- [ ] **Syntactic Check:** Run `npm run check`.
- [ ] **Doctor Check:** Run `npm run doctor` and ensure it passes (except for offline services if testing in a clean env).
- [ ] **Linter:** Ensure code follows the project's style (no trailing spaces, consistent indentation).

## 3. Documentation
- [ ] **README:** Positioning, badges, and quickstart are up to date.
- [ ] **Roadmap:** Ensure the current version's features are marked as completed.
- [ ] **Example Configs:** Check `examples/*.json` for any outdated schemas.

## 4. Integration Smoke Test
- [ ] **Frontdoor:** Start `npm run start:frontdoor` and visit `http://127.0.0.1:43173/health`.
- [ ] **Panel:** Start `npm run start:panel` and visit `http://127.0.0.1:43174/`.
- [ ] **Bridge:** (Optional but recommended) Perform one end-to-end voice command with a test MCP server.

## 5. Community Files
- [ ] **Workflow:** GitHub Actions (CI, Scorecard) are present and passing.
- [ ] **Templates:** Issue and PR templates are correct.
- [ ] **License:** `LICENSE` file is present and valid for the current year.

## 6. Release Branding
- [ ] Increment version in `package.json`.
- [ ] Draft release notes summarizing key changes.
- [ ] Prepare launch copy from `docs/LAUNCH_COPY.md`.
