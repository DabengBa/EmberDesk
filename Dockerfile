FROM node:24.16.0-alpine3.23

# Arguments
ARG APP_HOME=/home/node/app

# Install system dependencies
# "Don't rely on the base image for tools; if you call it, you install it." ;)
RUN apk add --no-cache curl gcompat tini git git-lfs su-exec shadow dos2unix

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=${PNPM_HOME}/bin:${PNPM_HOME}:${PATH}
RUN touch /root/.profile && \
  curl -fsSL https://get.pnpm.io/install.sh | env SHELL=/bin/sh ENV=/root/.profile PNPM_VERSION=12.0.0-rc.5 sh -

# Create app directory and set ownership
WORKDIR ${APP_HOME}
RUN chown node:node ${APP_HOME}

# Set NODE_ENV to production
ENV NODE_ENV=production

# Bundle app source and set ownership
COPY --chown=node:node . ./

# Install full dependency tree first so Vite (devDependency) can build React assets.
# Reinstall production-only packages after the precompile steps below.
RUN \
  echo "*** Install pnpm packages (including build tooling) ***" && \
  NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts

# Create config directory and link config.yaml. Added hardcoded dirs(constants.js?)
# that must be present for Non-Root Mode and volumeless docker runs.
RUN \
  rm -f "config.yaml" || true && \
  mkdir -p config data plugins public/scripts/extensions/third-party backups && \
  chown -R node:node config data plugins public/scripts/extensions/third-party backups && \
  ln -s "./config/config.yaml" "config.yaml"

# Pre-compile Vite library, React page, and panel bundles required at runtime.
# Login/setup/settings need app/dist/index.html; panel islands need their assets.
# Build order matters: login may empty app/dist; panel modes keep emptyOutDir=false.
RUN \
  echo "*** Build Vite library, React page, and panel bundles ***" && \
  pnpm run build:lib && \
  pnpm run build:react && \
  pnpm run build:react:character-library && \
  pnpm run build:react:workspace-panels && \
  test -f app/dist/index.html && \
  test -f app/dist/assets/character-library-panel.js && \
  test -f app/dist/assets/workspace-panels.js

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
  dos2unix "./docker-entrypoint.sh" && \
  rm -rf "./docker"

# Fix extension repos permissions
RUN git config --global --add safe.directory "*"

EXPOSE 8000

# Ensure proper handling of kernel signals
ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
