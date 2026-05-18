# VTT‑Chat — GitHub Workflows Guide

This document explains the GitHub Actions workflows used for CI/CD, testing, and Docker image builds.

---

## 📋 Overview

VTT‑Chat uses the following workflows:

| Workflow            | Trigger                      | Purpose                                                               |
| ------------------- | ---------------------------- | --------------------------------------------------------------------- |
| **QA Gates**        | PR + push to `main`          | Enforce release gates: lint, build, coverage thresholds, flaky-policy |
| **Release**         | Push to `main`               | Semantic versioning & changelog                                       |
| **Backend CI**      | PR to `backend/**`           | Lint, type-check, build, Prisma validate                              |
| **Frontend CI**     | PR to `frontend/**`          | Lint, type-check, Vite build                                          |
| **Backend Docker**  | Push to `main` (or tag `v*`) | Build & push Docker image (GHCR + Docker Hub)                         |
| **Frontend Docker** | Push to `main` (or tag `v*`) | Build & push Docker image (GHCR + Docker Hub)                         |

---

## 🔧 Setup Instructions

### 1. GitHub Actions Permissions

All workflows require minimal permissions:

- `contents: read` — for checking out code
- `packages: write` — for pushing to GHCR
- `issues: write` & `pull-requests: write` — for semantic-release (release workflow only)

These are requested in the workflow YAML. No manual GitHub permissions setup required.

---

### 2. Docker Hub Integration (Optional)

By default, images are pushed to **GitHub Container Registry (GHCR)** only.
To also push to **Docker Hub**, add these secrets to your repository:

#### Steps

1. Go to **Settings → Secrets and variables → Actions**

2. Click **New repository secret** for each:

   | Secret Name           | Description                            | Example         |
   | --------------------- | -------------------------------------- | --------------- |
   | `DOCKER_HUB_USERNAME` | Your Docker Hub username               | `yourname`      |
   | `DOCKER_HUB_TOKEN`    | Docker Hub Personal Access Token (PAT) | `dckr_pat_xxxx` |

3. To create a Docker Hub PAT:
   - Log in to [Docker Hub](https://hub.docker.com)
   - Go to **Account Settings → Security → Personal Access Tokens**
   - Click **Generate New Token**
   - Give it read/write permissions
   - Copy the token immediately (you won't see it again)

#### How It Works

Once secrets are configured, the Docker build workflows will:

- Build images with metadata tags (version, branch, SHA)
- Push to both:
  - `ghcr.io/yourrepo/vtt-chat-backend:latest` (GHCR)
  - `yourdockerhubname/vtt-chat-backend:latest` (Docker Hub)
- Use semantic versioning tags like `v1.2.3`

If `DOCKER_HUB_USERNAME` is not set, only GHCR is used (no failures).

---

## 🚀 Workflows in Detail

### QA Gates Workflow (`.github/workflows/qa-gates.yml`)

**Trigger:** Pull requests and pushes to `main`

**What it does:**

1. Installs workspace dependencies (`npm ci`)
2. Runs workspace lint (`npm run lint`)
3. Runs workspace build (`npm run build`)
4. Runs coverage suites (`npm run test:coverage`)
5. Enforces coverage thresholds (`npm run qa:coverage-report`)
6. Enforces flaky integration threshold (`npm run qa:flaky-tests:ci`)
7. Uploads reports as workflow artifacts (`coverage-gate-report.json`, coverage summaries, flaky report)

### Release Workflow (`.github/workflows/release.yml`)

**Trigger:** Push to `main` branch

**What it does:**

1. Checks out code
2. Sets up Node.js 25
3. Installs semantic-release plugins
4. Analyzes commit messages (conventional commits)
5. Updates `CHANGELOG.md`
6. Creates a GitHub release
7. Pushes changes back to `main`

**Requirements:**

- Repository must accept semantic-release pushes (typically enabled by default)
- `CHANGELOG.md` must exist in repo root

**Conventional Commit Format:**

For semantic-release to work, use:

```text
feat: Add new feature          # → minor version bump
fix: Fix a bug                 # → patch version bump
BREAKING CHANGE: ...           # → major version bump
```

Example:

```bash
git commit -m "feat: Add player ping system"
```

---

### Backend CI (`.github/workflows/backend-ci.yml`)

**Trigger:** Pull request with changes to `backend/**`

**Steps:**

1. Check out code
2. Install Node.js 25 (cached)
3. Run `npm install`
4. **Lint** — `npm run lint`
5. **Build** — `npm run build`
6. **Validate** — `npx prisma validate`

**Fails if:**

- Linting errors found
- TypeScript compilation fails
- Prisma schema is invalid

---

### Frontend CI (`.github/workflows/frontend-ci.yml`)

**Trigger:** Pull request with changes to `frontend/**`

**Steps:**

1. Check out code
2. Install Node.js 25 (cached)
3. Run `npm install`
4. **Lint** — `npm run lint`
5. **Type Check** — `npx tsc --noEmit`
6. **Build** — `npm run build`

**Fails if:**

- Linting errors found
- TypeScript type errors
- Vite build fails

---

### Backend Docker Build (`.github/workflows/backend-docker.yml`)

**Trigger:**

- Push to `main` branch
- Any push with a tag like `v1.2.3`

**Paths watched:**

- Changes to `backend/**`
- Changes to `.github/workflows/backend-docker.yml`

**What it does:**

1. Check out code
2. Set up Docker Buildx (for advanced build features)
3. Generate Docker metadata (tags based on branch/version/SHA)
4. Log in to GHCR
5. Log in to Docker Hub (if secrets configured)
6. Build and push image

**Generated Tags:**

For a push with tag `v1.2.3`:

```text
ghcr.io/yourrepo/vtt-chat-backend:1.2.3
ghcr.io/yourrepo/vtt-chat-backend:1.2
ghcr.io/yourrepo/vtt-chat-backend:main
ghcr.io/yourrepo/vtt-chat-backend:sha-abc123
yourdockerhubname/vtt-chat-backend:1.2.3  (if configured)
yourdockerhubname/vtt-chat-backend:1.2
yourdockerhubname/vtt-chat-backend:main
yourdockerhubname/vtt-chat-backend:sha-abc123
```

---

### Frontend Docker Build (`.github/workflows/frontend-docker.yml`)

Same as Backend Docker Build, but for `frontend/**`.

---

## 🐌 Troubleshooting

### Workflow fails with "Node 25 not found"

→ Update to the latest [ubuntu-latest](https://github.com/actions/virtual-environments) GitHub Actions runner.

### Docker build fails authentication

→ Ensure `DOCKER_HUB_USERNAME` and `DOCKER_HUB_TOKEN` secrets are set correctly.

### Semantic-release doesn't bump version

→ Verify commits follow [conventional commit](https://www.conventionalcommits.org/) format.

### Lint step fails but code works locally

→ Run `npm run lint` locally in repo root and fix issues.

---

## 🔄 Local Testing

### Test CI locally with act

If you want to test a workflow locally before pushing:

1. Install [act](https://github.com/nektos/act)

   ```bash
   brew install act
   ```

2. Run a workflow locally:

   ```bash
   act pull_request --job backend-ci
   ```

3. Pass secrets:

   ```bash
   act -s DOCKER_HUB_USERNAME=yourname -s DOCKER_HUB_TOKEN=token push
   ```

---

## 📝 Adding New Workflows

Guidelines:

1. Use `node-version: 25` for Node jobs
2. Set appropriate `permissions` (minimal required)
3. Use `cache: "npm"` to speed up installs
4. Add path filters to avoid unnecessary runs
5. Include problem matchers for linting output

Example:

```yaml
name: My Workflow

on:
  pull_request:
    paths:
      - 'backend/**'

jobs:
  my-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 25
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm install
      - run: npm run build
```

---

## 🎯 Next Steps

1. Push a feature branch with a commit like `feat: ...` to test CI
2. Create a PR to verify lint/build
3. Merge to `main` to trigger release workflow
4. Tag with `v1.0.0` to trigger Docker builds
5. Monitor GitHub Actions for success/failure

---
