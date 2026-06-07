# whirred.io blog

VitePress blog setup with Tailwind CSS, dark mode default, Mermaid diagrams, and Shiki code highlighting.

## Local development

```bash
npm install
npm run docs:dev
```

## Build static site

```bash
npm run docs:build
npm run docs:preview
```

## Docker build and run

```bash
npm run docker:build
npm run docker:run
```

Then open http://localhost:8080.

## Devcontainer

Open this folder in VS Code and run "Dev Containers: Reopen in Container".
The container installs dependencies on create and forwards port 5173 for VitePress.
