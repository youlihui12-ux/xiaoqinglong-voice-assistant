# Security Policy

Do not publish local credentials, task queues, logs, screenshots, or personal knowledge-base data.

If you find a secret in a commit, rotate the key first, then remove it from git history before making the repository public.

Runtime data intentionally ignored by git:

- `.env` and `*.env*`
- `logs/`
- `backups/`
- `xiaoqinglong-ai-tasks.json*`
- `xiaoqinglong-approvals.json`
- `xiaozhi-screenshot-*.png`
