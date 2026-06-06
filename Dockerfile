# --- base image ---
  # Step 1: Use the official Node.js 22 Alpine image as the base.
  # Alpine is a minimal Linux distro — keeps the image small (~50MB vs ~900MB).
  FROM node:22-alpine

  # Step 2: Set the working directory inside the container.
  # All subsequent commands run from here.
  WORKDIR /app

  # --- install dependencies (leverage layer caching) ---
  # Step 3: Copy only the package files first.
  # This layer only rebuilds when package.json or package-lock.json changes.
  COPY package*.json ./

  # Step 4: Install production dependencies only.
  # `npm ci` uses the lockfile exactly — reproducible, no surprises.
  # `--omit=dev` skips devDependencies (nodemon, etc.) to keep the image lean.
  RUN npm ci --omit=dev

  # --- copy the rest of the source ---
  # Step 5: Copy everything else.
  # This layer rebuilds on every code change, but npm ci is already cached.
  COPY . .

  # --- generate the Prisma client ---
  # Step 6: Run prisma generate so the client is built for this OS.
  # The generated client is compiled native code — it must be built inside the container,
  # not copied from your Mac.
  RUN npx prisma generate

  # --- runtime ---
  # Step 7: Tell Docker which port the app listens on.
  # This is documentation — it doesn't actually publish the port.
  EXPOSE 3000

  # Step 8: Start the server.
  CMD ["node", "server.js"]