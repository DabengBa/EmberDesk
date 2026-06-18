import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { serverDirectory } from '../server-directory.js';

const reactLoginDistRoot = path.join(serverDirectory, 'app', 'dist');

/**
 * Whether the built React login app is available on disk.
 * @returns {boolean}
 */
export function hasReactLoginBuild() {
    return fs.existsSync(path.join(reactLoginDistRoot, 'index.html'));
}

/**
 * Serves the built React login assets under an isolated prefix.
 * @returns {import('express').RequestHandler}
 */
export function getReactLoginServeMiddleware() {
    return express.static(reactLoginDistRoot, {
        index: false,
    });
}

/**
 * Sends the built React login shell.
 * @param {import('express').Response} response
 * @returns {void}
 */
export function sendReactLoginIndex(response) {
    response.sendFile('index.html', { root: reactLoginDistRoot });
}

export { reactLoginDistRoot };
