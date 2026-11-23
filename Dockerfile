FROM node:26.13.1-alpine3.24

# Arguments
ARG APP_HOME=/home/node/app

# Install system dependencies
RUN apk add --no-cache tini git su-exec shadow

RUN npm install --global --allow-scripts=pnpm pnpm@12.21.0

# Create app directory and set ownership
WORKDIR ${APP_HOME}
RUN chown node:node ${APP_HOME}

# Set NODE_ENV to production
ENV NODE_ENV=production
ENV EMBERDESK_CONFIG_PATH=./config/config.jsonc

# Bundle app source and set ownership
COPY --chown=node:node . ./

# Install full dependency tree first so Vite (devDependency) can build React assets.
# Reinstall production-only packages after the precompile steps below.
RUN \
  echo "*** Install pnpm packages (including build tooling) ***" && \
  NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts

# Directories required for non-root and volumeless runs.
RUN \
  mkdir -p config data plugins backups && \
  chown -R node:node config data plugins backups

# Pre-compile the legacy library and the shared React application.
RUN \
  echo "*** Build Vite library and React application ***" && \
  pnpm run build:lib && \
  pnpm run build:react && \
  test -f app/dist/index.html

# Drop build-time tooling from the runtime image.
RUN \
  echo "*** Prune to production dependencies ***" && \
  rm -rf node_modules && \
  pnpm install --frozen-lockfile --prod --ignore-scripts

# Set the entrypoint script and cleanup
RUN \
  echo "*** Cleanup ***" && \
  mv "./docker/docker-entrypoint.sh" "./" && \
  echo "*** Make docker-entrypoint.sh executable ***" && \
  chmod +x "./docker-entrypoint.sh" && \
  echo "*** Convert line endings to Unix format ***" && \
  busybox dos2unix "./docker-entrypoint.sh" && \
  rm -rf "./docker"

# Fix extension repos permissions
RUN git config --global --add safe.directory "*"

EXPOSE 8000

# Ensure proper handling of kernel signals
ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
