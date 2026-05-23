import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from '@jest/globals';

import { createServerStartupProfiler } from '../src/server-startup-profiler.js';

describe('createServerStartupProfiler', () => {
    test('should record both the error message and stack trace for failed stages', async () => {
        const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-profiler-')), 'startup-profile.json');
        const profiler = createServerStartupProfiler(outputPath);
        const failure = new Error('boom');

        await expect(profiler.measure('failing-stage', async () => {
            throw failure;
        })).rejects.toThrow('boom');

        profiler.flush();

        const profile = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

        expect(profile.stages).toHaveLength(1);
        expect(profile.stages[0]).toEqual(expect.objectContaining({
            name: 'failing-stage',
            error: expect.objectContaining({
                message: 'boom',
                stack: expect.stringContaining('Error: boom'),
            }),
        }));
    });
});
