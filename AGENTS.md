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

## Deploy to Devastation

- Site: `https://whirred.deva.station` on the local `devastation` host.
- Kubernetes context: `kind-devastation`; namespace: `default`; deployment and container: `whirred` (two replicas).
- Image: `registry.deva.station/meleneth/whirred-io:latest`. The deployment uses `imagePullPolicy: Always`, so restarting it pulls the newly pushed image.
- Run from this repository. The build includes current working-tree changes and runs `npm run docs:build` inside Docker.

```sh
docker build --network host -t registry.deva.station/meleneth/whirred-io:latest .
docker push registry.deva.station/meleneth/whirred-io:latest
kubectl --context kind-devastation -n default rollout restart deployment/whirred
kubectl --context kind-devastation -n default rollout status deployment/whirred --timeout=60s
kubectl --context kind-devastation -n default get pods -l app=whirred -o wide
curl -fsS -o /dev/null -w '%{http_code}\n' https://whirred.deva.station/
```

- Wait for each step to succeed before continuing. If rollout is still progressing after 60 seconds, inspect its pods and continue waiting as needed.
- Verify the changed page over HTTPS as well as the home page, and confirm the running `whirred` containers' image IDs match the digest reported by `docker push`.
- Docker and cluster access may require sandbox escalation. Retry the scoped command with escalation when socket access is denied.
- Infrastructure is defined in `/home/meleneth/code/cluster-ops/terraform/whirred.tf`. Its container command supplies nginx clean-URL handling (`try_files $uri $uri.html $uri/ =404`) and an IPv4 listener. Preserve that configuration when updating the site.
- A content deployment only needs the build, push, and rollout above. The `devastation-deploy-cluster-project` helper targets a different image/namespace convention and is not the deploy path for this site.

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
