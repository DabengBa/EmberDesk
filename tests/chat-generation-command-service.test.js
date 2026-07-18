import { describe, expect, test } from '@jest/globals';

import {
    GENERATION_COMMAND_KINDS,
    GENERATION_COMMAND_PATHS,
    GENERATION_COMMAND_REASONS,
    GENERATION_COMMAND_STATUSES,
    GENERATION_COMMAND_VISIBILITY,
    GENERATION_SERVICE_OWNER,
    createGenerationCommand,
    createGenerationCommandPlan,
    createGenerationRequestEnvelope,
    executeGenerationAttempts,
    mapLegacyGenerationTypeToCommandKind,
    mapGenerationCommandKindToLifecycleType,
    simulateGenerationCommandOutcome,
} from '../public/scripts/chat-generation-command-service.js';

describe('chat generation command service', () => {
    test('exposes the complete public command kind matrix', () => {
        expect(GENERATION_COMMAND_KINDS).toEqual([
            'submitComposer',
            'continueLast',
            'retryGeneration',
            'swipeLeft',
            'swipeRight',
            'quietPrompt',
            'quietToLoud',
            'backgroundGeneration',
        ]);
    });

    test.each([
        ['submitComposer', 'normal'],
        ['continueLast', 'continue'],
        ['retryGeneration', 'regenerate'],
        ['swipeLeft', 'swipe'],
        ['swipeRight', 'swipe'],
        ['quietPrompt', 'quiet'],
        ['quietToLoud', 'quiet'],
        ['backgroundGeneration', 'quiet'],
    ])('maps command kind %s to lifecycle type %s', (kind, lifecycleType) => {
        expect(mapGenerationCommandKindToLifecycleType(kind)).toBe(lifecycleType);
    });

    test.each([
        [
            'visible openai direct submit',
            { kind: 'submitComposer', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
                reason: GENERATION_COMMAND_REASONS.SUPPORTED_KIND,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'visible non-openai provider',
            { kind: 'submitComposer', mainApi: 'kobold' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.NON_OPENAI_PROVIDER,
                reason: GENERATION_COMMAND_REASONS.NON_OPENAI_PROVIDER,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'visible group chat',
            { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.GROUP_CHAT,
                reason: GENERATION_COMMAND_REASONS.GROUP_CHAT,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'visible dry run',
            { kind: 'submitComposer', mainApi: 'openai', dryRun: true },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.DRY_RUN,
                reason: GENERATION_COMMAND_REASONS.DRY_RUN,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'visible nested depth',
            { kind: 'submitComposer', mainApi: 'openai', depth: 1 },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.NESTED_VISIBLE_GENERATION,
                reason: GENERATION_COMMAND_REASONS.NESTED_GENERATION,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'continue last',
            { kind: 'continueLast', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.STANDARD_OPENAI_VISIBLE_DIRECT_CHAT,
                reason: GENERATION_COMMAND_REASONS.SUPPORTED_KIND,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'retry generation',
            { kind: 'retryGeneration', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'swipe left',
            { kind: 'swipeLeft', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'swipe right',
            { kind: 'swipeRight', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                visibility: GENERATION_COMMAND_VISIBILITY.VISIBLE,
                executable: true,
            },
        ],
        [
            'quiet prompt helper',
            { kind: 'quietPrompt', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.QUIET_NON_VISIBLE_HELPER,
                reason: GENERATION_COMMAND_REASONS.QUIET_GENERATION,
                visibility: GENERATION_COMMAND_VISIBILITY.NON_VISIBLE,
                executable: true,
            },
        ],
        [
            'quiet to loud helper',
            { kind: 'quietToLoud', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.QUIET_TO_LOUD_NON_VISIBLE_HELPER,
                reason: GENERATION_COMMAND_REASONS.QUIET_TO_LOUD,
                visibility: GENERATION_COMMAND_VISIBILITY.NON_VISIBLE,
                executable: true,
            },
        ],
        [
            'background generation helper',
            { kind: 'backgroundGeneration', mainApi: 'openai' },
            {
                owner: GENERATION_SERVICE_OWNER,
                status: GENERATION_COMMAND_STATUSES.SERVICE_OWNED,
                path: GENERATION_COMMAND_PATHS.BACKGROUND_NON_VISIBLE_HELPER,
                reason: GENERATION_COMMAND_REASONS.BACKGROUND_GENERATION,
                visibility: GENERATION_COMMAND_VISIBILITY.NON_VISIBLE,
                executable: true,
            },
        ],
    ])('classifies %s as service-owned without legacy owner', (_name, input, expected) => {
        const command = createGenerationCommand(input);
        expect(command).toMatchObject(expected);
        expect(command.owner).toBe(GENERATION_SERVICE_OWNER);
        expect(command.owner).not.toBe('legacy');
        expect(command.owner).not.toBe('react');
        expect(String(command.status)).not.toContain('legacy');
    });

    test('rejects unknown kinds with explicit unsupported status, never legacy', () => {
        const command = createGenerationCommand({ kind: 'rerollEverything', mainApi: 'openai' });
        expect(command).toMatchObject({
            owner: GENERATION_SERVICE_OWNER,
            kind: 'rerollEverything',
            status: GENERATION_COMMAND_STATUSES.UNSUPPORTED_WITH_REASON,
            path: GENERATION_COMMAND_PATHS.UNKNOWN_GENERATION_KIND,
            reason: GENERATION_COMMAND_REASONS.UNSUPPORTED_KIND,
            executable: false,
        });
        expect(command.owner).not.toBe('legacy');
    });

    test('plans bounded recovery for visible openai direct chat when fallback is ready', () => {
        const plan = createGenerationCommandPlan(
            { kind: 'submitComposer', mainApi: 'openai' },
            {
                fallbackReady: true,
                statusLabels: { primaryRetry: 'Retrying', fallback: 'Using fallback' },
            },
        );

        expect(plan.owner).toBe(GENERATION_SERVICE_OWNER);
        expect(plan.shouldAutoRecover).toBe(true);
        expect(plan.attempts).toEqual([
            { label: 'primary', status: '', fallbackProvider: false },
            { label: 'primary_retry', status: 'Retrying', fallbackProvider: false },
            { label: 'fallback', status: 'Using fallback', fallbackProvider: true },
        ]);
        expect(plan.producesVisibleRow).toBe(true);
        expect(plan.usesStreamingTransport).toBe(true);
        expect(plan.baselineStrategy).toBe('lifecycle-baseline');
    });

    test.each([
        ['non-openai', { kind: 'submitComposer', mainApi: 'kobold' }],
        ['dry-run', { kind: 'submitComposer', mainApi: 'openai', dryRun: true }],
        ['nested', { kind: 'submitComposer', mainApi: 'openai', depth: 1 }],
        ['quiet', { kind: 'quietPrompt', mainApi: 'openai' }],
        ['quiet-to-loud', { kind: 'quietToLoud', mainApi: 'openai' }],
        ['background', { kind: 'backgroundGeneration', mainApi: 'openai' }],
    ])('keeps %s on a single primary attempt without auto recovery', (_name, input) => {
        const plan = createGenerationCommandPlan(input, { fallbackReady: true });
        expect(plan.owner).toBe(GENERATION_SERVICE_OWNER);
        expect(plan.shouldAutoRecover).toBe(false);
        expect(plan.attempts).toEqual([
            { label: 'primary', status: '', fallbackProvider: false },
        ]);
    });

    test('quiet/background plans never produce a visible row', () => {
        for (const kind of ['quietPrompt', 'quietToLoud', 'backgroundGeneration']) {
            const plan = createGenerationCommandPlan({ kind, mainApi: 'openai' });
            expect(plan.producesVisibleRow).toBe(false);
            expect(plan.command.capabilities.returnsGeneratedText).toBe(true);
            expect(plan.command.capabilities.bindsVisibleMessageRow).toBe(false);
            expect(plan.finalizationStrategy).toBe('return-generated-text');
        }
    });

    test.each(GENERATION_COMMAND_KINDS)(
        'simulates success/failure/abort for kind %s with explicit owner and finalization',
        (kind) => {
            const plan = createGenerationCommandPlan(
                { kind, mainApi: 'openai' },
                { fallbackReady: true },
            );

            const success = simulateGenerationCommandOutcome(plan, { outcome: 'success' });
            expect(success.owner).toBe(GENERATION_SERVICE_OWNER);
            expect(success.outcome).toBe('success');
            expect(success.attempt.label).toBe('primary');
            expect(success.finalization).toMatchObject({
                action: expect.stringMatching(/save_reply|replace_recovery_message/),
            });

            const failure = simulateGenerationCommandOutcome(plan, {
                outcome: 'failure',
                attemptIndex: 0,
                failure: new TypeError('Failed to fetch'),
            });
            expect(failure.owner).toBe(GENERATION_SERVICE_OWNER);
            expect(failure.failureDecision).toMatchObject({
                action: expect.stringMatching(/retry|final_recovery|propagate/),
            });
            if (plan.shouldAutoRecover) {
                expect(failure.failureDecision.action).toBe('retry');
                expect(failure.nextAttemptIndex).toBe(1);
            } else {
                expect(failure.failureDecision.action).toBe('propagate');
                expect(failure.nextAttemptIndex).toBeNull();
            }

            const abort = simulateGenerationCommandOutcome(plan, {
                outcome: 'abort',
                attemptIndex: 0,
            });
            expect(abort.owner).toBe(GENERATION_SERVICE_OWNER);
            expect(abort.failureDecision).toMatchObject({
                action: 'propagate',
                recoverable: false,
                shouldThrow: true,
            });
        },
    );

    test('does not invent a legacy fallback owner for any matrix entry', () => {
        const fixtures = [
            { kind: 'submitComposer', mainApi: 'openai' },
            { kind: 'submitComposer', mainApi: 'kobold' },
            { kind: 'submitComposer', mainApi: 'openai', selectedGroup: true },
            { kind: 'submitComposer', mainApi: 'openai', dryRun: true },
            { kind: 'submitComposer', mainApi: 'openai', depth: 2 },
            { kind: 'continueLast', mainApi: 'openai' },
            { kind: 'retryGeneration', mainApi: 'openai' },
            { kind: 'swipeLeft', mainApi: 'openai' },
            { kind: 'swipeRight', mainApi: 'openai' },
            { kind: 'quietPrompt', mainApi: 'openai' },
            { kind: 'quietToLoud', mainApi: 'openai' },
            { kind: 'backgroundGeneration', mainApi: 'openai' },
            { kind: 'unknown-kind', mainApi: 'openai' },
        ];

        for (const input of fixtures) {
            const command = createGenerationCommand(input);
            const plan = createGenerationCommandPlan(input);
            expect(command.owner).toBe(GENERATION_SERVICE_OWNER);
            expect(plan.owner).toBe(GENERATION_SERVICE_OWNER);
            expect(JSON.stringify(command)).not.toMatch(/"legacy"/);
            expect(JSON.stringify(plan)).not.toMatch(/"legacy"/);
        }
    });

    test.each([
        ['normal', {}, 'submitComposer'],
        ['continue', {}, 'continueLast'],
        ['regenerate', {}, 'retryGeneration'],
        ['swipe', { swipeDirection: 'left' }, 'swipeLeft'],
        ['swipe', { swipeDirection: 'right' }, 'swipeRight'],
        ['quiet', {}, 'quietPrompt'],
        ['quiet', { quietToLoud: true }, 'quietToLoud'],
        ['quiet', { backgroundGeneration: true }, 'backgroundGeneration'],
    ])('maps shell generation type %s to service command %s', (type, options, expected) => {
        expect(mapLegacyGenerationTypeToCommandKind(type, options)).toBe(expected);
    });

    test('creates an opaque request envelope without changing provider or prompt inputs', () => {
        const options = {
            quiet_prompt: 'summarize',
            force_chid: 3,
            jsonSchema: { name: 'summary' },
            depth: 2,
        };
        const envelope = createGenerationRequestEnvelope({
            type: 'normal',
            options,
            dryRun: true,
            mainApi: 'google',
            selectedGroup: true,
        });

        expect(envelope).toMatchObject({
            owner: GENERATION_SERVICE_OWNER,
            type: 'normal',
            kind: 'submitComposer',
            mainApi: 'google',
            selectedGroup: true,
            dryRun: true,
        });
        expect(envelope.options).toBe(options);
        expect(envelope.command).toMatchObject({
            owner: GENERATION_SERVICE_OWNER,
            path: GENERATION_COMMAND_PATHS.NESTED_VISIBLE_GENERATION,
            mainApi: 'google',
            selectedGroup: true,
            dryRun: true,
            depth: 2,
        });
    });

    test('runs retry attempts through one service-owned attempt loop', async () => {
        const calls = [];
        const attempts = [
            { label: 'primary', fallbackProvider: false },
            { label: 'fallback', fallbackProvider: true },
        ];

        const result = await executeGenerationAttempts({
            attempts,
            prepareRetryAttempt: async (attempt, index) => calls.push(`prepare:${index}:${attempt.label}`),
            runAttempt: async (attempt, index) => {
                calls.push(`run:${index}:${attempt.label}`);
                if (index === 0) {
                    throw new Error('primary failed');
                }
                return 'fallback result';
            },
            handleFailure: async (_error, attempt, index) => {
                calls.push(`failure:${index}:${attempt.label}`);
                return { action: 'retry' };
            },
        });

        expect(result).toBe('fallback result');
        expect(calls).toEqual([
            'prepare:0:primary',
            'run:0:primary',
            'failure:0:primary',
            'prepare:1:fallback',
            'run:1:fallback',
        ]);
    });
});
