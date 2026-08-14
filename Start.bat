@echo off
pushd %~dp0
set NODE_ENV=production
call pnpm install --prod --frozen-lockfile --ignore-scripts
call pnpm start -- %*
pause
popd
