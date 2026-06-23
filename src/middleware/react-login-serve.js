import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { serverDirectory } from '../server-directory.js';

const reactLoginDistRoot = path.join(serverDirectory, 'app', 'dist');

function resolveReactLoginDistRoot(distRoot = reactLoginDistRoot) {
    return path.resolve(distRoot);
}

/**
 * Whether the built React login app is available on disk.
 * @param {string} [distRoot]
 * @returns {boolean}
 */
export function hasReactLoginBuild(distRoot) {
    return fs.existsSync(path.join(resolveReactLoginDistRoot(distRoot), 'index.html'));
}

/**
 * Serves the built React login assets under an isolated prefix.
 * @param {string} [distRoot]
 * @returns {import('express').RequestHandler}
 */
export function getReactLoginServeMiddleware(distRoot) {
    return express.static(resolveReactLoginDistRoot(distRoot), {
        index: false,
    });
}

/**
 * Sends the built React login shell.
 * @param {import('express').Response} response
 * @param {string} [distRoot]
 * @returns {void}
 */
export function sendReactLoginIndex(response, distRoot) {
    response.sendFile('index.html', { root: resolveReactLoginDistRoot(distRoot) });
}

export { reactLoginDistRoot, resolveReactLoginDistRoot };
