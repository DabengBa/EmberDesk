@echo off
pushd %~dp0
call pnpm install --prod --frozen-lockfile --no-ignore-scripts --reporter=silent
call pnpm run start -- server.js %*
pause
popd
