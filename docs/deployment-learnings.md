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

## Phase 33 — Deploy Frontend to Azure Static Web Apps

**What this module does**
Deploys the Vite/React frontend to Azure Static Web Apps (SWA) — a free CDN that serves the built HTML/JS/CSS files globally with automatic SSL. A GitHub Actions workflow builds the app on every push to `main` (when `client/` changes) and deploys the output to SWA automatically. Three problems were solved: SPA routing 404s, cross-domain cookies, and wiring the production backend URL into the build.

**Key design decision**
All API calls are prefixed with `API_BASE = import.meta.env.VITE_API_BASE ?? ""`. In dev this is empty, so paths like `/api/auth/me` stay relative and Vite's proxy handles them. In production, `VITE_API_BASE` is set to the Container App URL, so the same fetch call resolves to the full cross-domain URL. One variable, one place — no code branching between environments. All fetch logic was also extracted into a `services/` layer so no component or hook calls `fetch` directly.

**One thing I found surprising**
`sameSite: "strict"` on a cookie silently blocks it on every cross-site request — no error, no warning, the cookie just isn't sent. When the frontend and backend are on different domains, every API call is cross-site, so auth silently breaks. The fix is `sameSite: "none"` + `secure: true`, but the browser then requires HTTPS (SSL) on both ends. Azure provisions SSL certificates automatically on both SWA and Container Apps domains, so it works without any manual certificate setup.

**Interview Q&A**

Q: How does your React app talk to the backend in production?
A: In dev, Vite's proxy intercepts `/api/*` calls and forwards them to `localhost:3000`, so everything looks same-origin. In production, the frontend reads `VITE_API_BASE` — an environment variable baked in at build time — and prepends it to every fetch call. So `fetch('/api/auth/me')` becomes `fetch('https://backend.azurecontainerapps.io/api/auth/me')`. The request goes directly from the browser to the Container App.

Q: What is `sameSite: "none"` and why did you need it?
A: `sameSite: "strict"` tells the browser to never send the cookie on cross-site requests — it's a CSRF defence. In production my frontend and backend are on different domains, so every API call is cross-site and the cookie gets silently blocked. Setting `sameSite: "none"` allows the cookie to be sent cross-site, but the browser requires `secure: true` alongside it — meaning the connection must be over HTTPS (SSL). Azure provisions SSL certificates automatically on both domains.

Q: What is SSL and why does it matter here?
A: SSL (now called TLS) is the encryption layer behind `https://`. It encrypts every request and response so no one in the middle can read them, and it verifies the server's identity. It matters for cookies specifically because `sameSite: "none"` cookies are only sent over HTTPS — the browser refuses to send them over plain HTTP. Azure SWA and Container Apps both provide automatic SSL certificates, so both domains get `https://` without any manual setup.

Q: What is a static web app and why is it a good choice for a React SPA?
A: A static web app is a CDN serving pre-built HTML, CSS, and JS files — there's no server running. For a React SPA that's ideal: Vite compiles everything into `dist/` at deploy time, and Azure SWA distributes those files globally with SSL included. Requests are served from the nearest edge node, which is fast. The trade-off is no server-side rendering — every page is assembled client-side after the JS loads.

Q: Why does `navigationFallback` exist in `staticwebapp.config.json`?
A: A static file host serves files by path. If someone navigates directly to `/movies`, the host looks for a `movies.html` file — which doesn't exist — and returns a 404. React Router only works client-side after `index.html` loads. `navigationFallback` tells SWA to serve `index.html` for any unmatched path, letting React Router take over and render the correct page.

## Phase 34 — Backend CI/CD with GitHub Actions

**What this module does**
Automates backend deployment via a GitHub Actions workflow. On every push to `main` that changes a backend file, the workflow builds a new `linux/amd64` Docker image, pushes it to Azure Container Registry, then runs `az containerapp update` to deploy the new image to the Container App. A `workflow_dispatch:` trigger allows manual runs from the GitHub UI without needing a code change.

**Key design decision**
The workflow uses `paths:` filtering to only run when backend files change — pushing a frontend change won't waste 5 minutes rebuilding a Docker image. But `paths:` creates a blind spot: changes to the workflow YAML file itself don't match the filter and never trigger a run. `workflow_dispatch:` solves this by adding a manual trigger as an escape hatch for testing the pipeline or forcing a redeploy.

**One thing I found surprising**
GitHub Actions runners are fresh VMs with no Docker layer cache. Every run re-downloads all npm packages and rebuilds every layer from scratch, even if nothing changed. Locally, Docker reuses cached layers and the build is near-instant. The fix is `cache-from`/`cache-to` in `docker/build-push-action`, which stores layer cache in the container registry between CI runs — but this adds complexity and isn't needed until build times become painful.

**Interview Q&A**

Q: How does your backend get deployed when you push code?
A: A GitHub Actions workflow watches for pushes to `main` that touch backend files. When triggered, it builds a new Docker image for `linux/amd64`, pushes it to Azure Container Registry, then calls `az containerapp update` to point the Container App at the new image. Azure creates a new revision and gradually shifts traffic to it with zero downtime.

Q: What is a service principal and why does the CI pipeline need one?
A: A service principal is a machine identity in Azure — like a user account but for automated systems. The GitHub Actions runner needs permission to call `az containerapp update`, which requires authenticating to Azure. A service principal with contributor role on the resource group gives the runner exactly the permissions it needs, without using a personal account's credentials.

Q: Why does building the Docker image in CI take longer than locally?
A: GitHub Actions runners are fresh VMs spun up from scratch for every run — no cached Docker layers. Every `RUN npm ci` re-downloads packages from the internet. Locally, Docker caches each layer after the first build, so unchanged layers are skipped entirely. The solution is to store the layer cache in the container registry using `cache-from`/`cache-to` in the build action.
