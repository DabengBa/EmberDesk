import {
    applyCharacterAuthoringDraftToCreateState,
    createCharacterAuthoringDraft,
    createCharacterAuthoringDraftFromCreateState,
    createCharacterAuthoringSession,
    createCharacterAuthoringSaveModel,
    getCharacterAuthoringDirtyFields,
    validateCharacterAuthoringDraft,
} from '../public/scripts/character-authoring.js';

describe('character authoring facade', () => {
    test('projects editable character fields and reports unsupported extension fields', () => {
        const draft = createCharacterAuthoringDraft({
            name: 'Mira',
            avatar: 'Mira.png',
            description: 'A field medic.',
            personality: 'Calm',
            scenario: 'After the evacuation',
            first_mes: 'Stay with me.',
            mes_example: '<START>',
            fav: true,
            talkativeness: 0.72,
            creatorcomment: 'Keep tone grounded.',
            data: {
                creator: 'Allen',
                character_version: '2.1',
                creator_notes: 'Visible creator note.',
                tags: ['medic', 'sci-fi'],
                alternate_greetings: ['We have to move.'],
                system_prompt: 'System override',
                post_history_instructions: 'After history',
                extensions: {
                    world: 'Colony Lore',
                    depth_prompt: {
                        prompt: 'Stay tense',
                        depth: 3,
                        role: 0,
                    },
                    third_party_blob: {
                        keep: true,
                    },
                },
            },
        });

        expect(draft).toMatchObject({
            mode: 'edit',
            name: 'Mira',
            avatar: 'Mira.png',
            description: 'A field medic.',
            firstMessage: 'Stay with me.',
            favorite: true,
            tags: ['medic', 'sci-fi'],
            creatorNotes: 'Visible creator note.',
            characterWorld: 'Colony Lore',
            alternateGreetings: ['We have to move.'],
            depthPrompt: {
                prompt: 'Stay tense',
                depth: 3,
                role: 0,
            },
        });
        expect(draft.unsupportedFields).toEqual(['data.extensions.third_party_blob']);
    });

    test('validates name locally without discarding entered values', () => {
        const draft = createCharacterAuthoringDraft({
            name: 'Mira',
            description: 'keep this',
        });
        const edited = { ...draft, name: '   ' };

        expect(validateCharacterAuthoringDraft(edited)).toEqual({
            valid: false,
            fieldErrors: {
                name: 'Name is required',
            },
        });
        expect(edited.description).toBe('keep this');
    });

    test('reports dirty fields and builds a safe save model without unsupported fields', () => {
        const initial = createCharacterAuthoringDraft({
            name: 'Mira',
            description: 'old',
            data: {
                extensions: {
                    world: 'Old World',
                    extensionOwned: 'do not write',
                },
            },
        });
        const edited = {
            ...initial,
            description: 'new',
            characterWorld: 'New World',
        };

        expect(getCharacterAuthoringDirtyFields(initial, edited)).toEqual(['description', 'characterWorld']);
        expect(createCharacterAuthoringSaveModel(edited)).toMatchObject({
            fields: {
                name: 'Mira',
                description: 'new',
            },
            extensions: {
                world: 'New World',
            },
            unsupportedFields: ['data.extensions.extensionOwned'],
        });
        expect(createCharacterAuthoringSaveModel(edited).extensions).not.toHaveProperty('extensionOwned');
    });

    test('runs an authoring session with local errors, cancel reset, and legacy write-through submit payload', () => {
        const session = createCharacterAuthoringSession({
            name: 'Mira',
            description: 'old',
            first_mes: 'Hello',
            data: {
                tags: ['medic'],
                extensions: {
                    world: 'Old World',
                },
            },
        });

        const blankName = session.update({ name: '   ', description: 'new' });
        expect(blankName.dirty).toBe(true);
        expect(blankName.submit()).toEqual({
            ok: false,
            fieldErrors: {
                name: 'Name is required',
            },
        });
        expect(blankName.draft.description).toBe('new');

        const edited = blankName.update({
            name: 'Mira Prime',
            characterWorld: 'New World',
            alternateGreetings: ['Move.'],
        });
        expect(edited.dirtyFields).toEqual(['name', 'description', 'characterWorld', 'alternateGreetings']);
        expect(edited.submit()).toMatchObject({
            ok: true,
            action: 'saveCharacterAuthoring',
            payload: {
                fields: {
                    name: 'Mira Prime',
                    description: 'new',
                    first_mes: 'Hello',
                },
                extensions: {
                    world: 'New World',
                },
            },
        });

        const canceled = edited.cancel();
        expect(canceled.dirty).toBe(false);
        expect(canceled.draft).toEqual(session.initialDraft);
    });

    test('accepts an already projected React draft without dropping camelCase authoring fields', () => {
        const draft = createCharacterAuthoringDraft({
            name: 'Mira',
            description: 'old',
            first_mes: 'Hello',
            data: {
                creator_notes: 'Keep tone grounded.',
                post_history_instructions: 'Remember the triage order.',
                system_prompt: 'Stay procedural.',
                tags: ['medic'],
                alternate_greetings: ['Move.'],
                extensions: {
                    world: 'Old World',
                    depth_prompt: {
                        prompt: 'Stay tense',
                        depth: 3,
                        role: 0,
                    },
                },
            },
        });

        const session = createCharacterAuthoringSession(draft, { mode: 'edit' });

        expect(session.draft).toMatchObject({
            name: 'Mira',
            description: 'old',
            firstMessage: 'Hello',
            creatorNotes: 'Keep tone grounded.',
            postHistoryInstructions: 'Remember the triage order.',
            systemPrompt: 'Stay procedural.',
            tags: ['medic'],
            alternateGreetings: ['Move.'],
            characterWorld: 'Old World',
            depthPrompt: {
                prompt: 'Stay tense',
                depth: 3,
                role: 0,
            },
        });
        expect(session.submit()).toMatchObject({
            ok: true,
            payload: {
                fields: {
                    first_mes: 'Hello',
                    creator_notes: 'Keep tone grounded.',
                    post_history_instructions: 'Remember the triage order.',
                    system_prompt: 'Stay procedural.',
                    tags: ['medic'],
                    alternate_greetings: ['Move.'],
                },
                extensions: {
                    world: 'Old World',
                    depth_prompt: {
                        prompt: 'Stay tense',
                        depth: 3,
                        role: 0,
                    },
                },
            },
        });
    });

    test('projects legacy create-state into a draft and syncs edited values back to create-state fields', () => {
        const createState = {
            name: 'Ada',
            description: 'Original summary',
            creator_notes: 'Legacy note',
            post_history_instructions: 'Stay terse',
            character_version: '1.4',
            system_prompt: 'System seed',
            tags: 'pilot, sci-fi',
            creator: 'Allen',
            personality: 'Dry',
            first_message: 'Welcome aboard.',
            scenario: 'Docking bay',
            mes_example: '<START>',
            world: 'Orbital Archive',
            talkativeness: 0.33,
            alternate_greetings: ['Hello again.'],
            depth_prompt_prompt: 'Keep it procedural',
            depth_prompt_depth: 5,
            depth_prompt_role: 'system',
            extensions: {
                third_party_blob: {
                    keep: true,
                },
            },
        };

        const draft = createCharacterAuthoringDraftFromCreateState(createState);

        expect(draft).toMatchObject({
            mode: 'create',
            name: 'Ada',
            description: 'Original summary',
            creatorNotes: 'Legacy note',
            postHistoryInstructions: 'Stay terse',
            systemPrompt: 'System seed',
            tags: ['pilot', 'sci-fi'],
            creator: 'Allen',
            firstMessage: 'Welcome aboard.',
            characterWorld: 'Orbital Archive',
            alternateGreetings: ['Hello again.'],
            depthPrompt: {
                prompt: 'Keep it procedural',
                depth: 5,
                role: null,
            },
        });
        expect(draft.unsupportedFields).toEqual(['data.extensions.third_party_blob']);

        const syncedState = applyCharacterAuthoringDraftToCreateState({
            ...draft,
            name: 'Ada Prime',
            tags: ['pilot', 'found-family'],
            characterWorld: 'Deep Archive',
            alternateGreetings: ['Hello again.', 'Docking complete.'],
        }, createState);

        expect(syncedState).toMatchObject({
            name: 'Ada Prime',
            tags: 'pilot, found-family',
            world: 'Deep Archive',
            alternate_greetings: ['Hello again.', 'Docking complete.'],
            depth_prompt_prompt: 'Keep it procedural',
            depth_prompt_depth: 5,
            depth_prompt_role: null,
            extensions: {
                third_party_blob: {
                    keep: true,
                },
                world: 'Deep Archive',
                depth_prompt: {
                    prompt: 'Keep it procedural',
                    depth: 5,
                    role: null,
                },
            },
        });
    });
});
