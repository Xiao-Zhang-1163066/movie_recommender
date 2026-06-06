# Deployment Learnings

## Phase 32 — Dockerise & Deploy Backend to Azure Container Apps

**What this module does**
Packages the Express API into a Docker image and deploys it to Azure Container Apps. The pipeline: write a Dockerfile → build locally → push to Azure Container Registry → create a Container App. Environment variables (DATABASE_URL, JWT_SECRET, API keys) are injected by Azure at runtime, replacing the local `.env` file.

**Key design decision**
Azure Container Apps runs on `linux/amd64` (Intel). Building on an Apple Silicon Mac produces a `linux/arm64` image by default, which Azure rejects. The fix is `docker build --platform linux/amd64` — always specify the target platform explicitly when building for cloud deployment from an ARM machine.

**One thing I found surprising**
`COPY . .` in a Dockerfile copies everything including `node_modules/` (200MB+), `.env` (secrets), and `client/` (the frontend) unless a `.dockerignore` excludes them. Without `.dockerignore`, every build is slow and the image contains secrets that should never be baked in. `.dockerignore` works exactly like `.gitignore` and is just as essential.

**Interview Q&A**

Q: What is Docker and why use it for deployment?
A: Docker packages an app, its runtime, and its dependencies into one portable image. The image runs identically everywhere — your laptop, CI, Azure — eliminating "works on my machine" problems. Azure Container Apps pulls and runs that image directly, handling the VM, load balancer, and SSL.

Q: Why does the order of COPY instructions in a Dockerfile matter?
A: Docker builds in layers and caches each one. If a layer hasn't changed, Docker reuses the cache and skips it. Copying `package*.json` first and running `npm ci` second means dependency installation is only re-run when the lockfile changes — not on every code change. Reversing the order invalidates the npm cache on every build.

Q: Why run `prisma generate` inside the Dockerfile instead of copying the generated client from your Mac?
A: The Prisma generated client contains native binaries compiled for the host OS. A client built on macOS (ARM) won't run on Linux (amd64). Running `prisma generate` inside the container builds it for the correct target OS.

Q: What is a cold start and when does it happen on Azure Container Apps?
A: Azure Container Apps scales to zero replicas when idle — the container shuts down completely. The first request after an idle period triggers a cold start: Azure wakes the container, starts Node, and connects to the DB before serving the request. This takes 5–15 seconds. You eliminate it by setting a minimum replica count of 1, at the cost of 24/7 compute charges.
