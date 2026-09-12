# Agent Notes

This repo is a VitePress documentation site. These notes are for Codex and other automation working in this workspace.

## Local Environment

- The repo lives at `/workspaces/whirred-io` inside a devcontainer.
- The sandbox in this container may fail with `bwrap: No permissions to create a new namespace`. If a normal shell command fails that way, retry the same scoped command with escalation instead of inventing a workaround.
- Prefer `rg`, `find`, `sed`, and `git` for inspection. Keep commands small and targeted so failures are easy to diagnose.
- Do not use destructive git commands such as `git reset --hard` or `git checkout --` unless the user explicitly asks for them.

## VitePress

- Main scripts are in `package.json`:
  - `npm run docs:dev`
  - `npm run docs:build`
- The devcontainer is intended to serve VitePress automatically on port `5173`.
- When changing docs structure, navigation, Vue components, or Mermaid content, run `npm run docs:build` before calling the work done.

## Content Structure

- The IAM system demo lives under `docs/articles/series/IAM-System-Demo/`.
- Keep the GraphQL authorization explosion case-study spine separate from Developer Affordances.
- Developer Affordances currently includes:
  - `dev-affordances-distributed-platform-in-10-minutes.md`
  - `dev-affordances-activeresource-default-implementation.md`
  - `dev-affordances-creating-a-million-users.md`
  - `devcontainers-for-local-distributed-systems.md`
  - `foreman-for-local-process-orchestration.md`

## LLM-Generated Content Disclosure

- Keep the site's LLM disclosure at the top of `docs/index.md`.
- Do not add per-article LLM disclaimers, including for substantial generation or rewrites. The front-page disclosure covers LLM assistance, generation, and the author's editorial responsibility.
- Preserve substantive audit notes and limitations independently of the disclosure.

## Recommendations

- `RECOMMENDATIONS.md` is a working planning artifact.
- Do not stage or commit `RECOMMENDATIONS.md` unless the user explicitly asks for that exact file to be committed.
- If the user asks to commit "everything reasonable", exclude `RECOMMENDATIONS.md` by default.

## Commit Hygiene

- Check `git status --short` before staging.
- Stage only files related to the requested change.
- Preserve user edits. If unrelated files are dirty, leave them alone.
- If committing docs changes, mention the article or navigation area in the commit message.
