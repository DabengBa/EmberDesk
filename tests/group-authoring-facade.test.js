import {
    createGroupAuthoringDraft,
    createGroupAuthoringSession,
    createGroupAuthoringSaveModel,
    getGroupAuthoringDirtyFields,
    moveGroupAuthoringMember,
    validateGroupAuthoringDraft,
} from '../public/scripts/group-authoring.js';

describe('group authoring facade', () => {
    test('projects editable group fields with stable member order', () => {
        const draft = createGroupAuthoringDraft({
            id: 'group-1',
            name: 'Night Shift',
            avatar_url: 'group.png',
            members: ['A.png', 'B.png'],
            disabled_members: ['B.png'],
            fav: true,
            allow_self_responses: true,
            hideMutedSprites: true,
            activation_strategy: 1,
            generation_mode: 2,
            auto_mode_delay: 7,
            generation_mode_join_prefix: '## <FIELDNAME>',
            generation_mode_join_suffix: '</FIELDNAME>',
            tagIds: ['night-shift'],
        });

        expect(draft).toEqual(expect.objectContaining({
            id: 'group-1',
            name: 'Night Shift',
            avatarUrl: 'group.png',
            members: ['A.png', 'B.png'],
            disabledMembers: ['B.png'],
            favorite: true,
            allowSelfResponses: true,
            hideMutedSprites: true,
            activationStrategy: 1,
            generationMode: 2,
            autoModeDelay: 7,
            joinPrefix: '## <FIELDNAME>',
            joinSuffix: '</FIELDNAME>',
            tagIds: ['night-shift'],
        }));
    });

    test('validates empty groups locally before save', () => {
        const draft = createGroupAuthoringDraft({
            name: '',
            members: [],
        });

        expect(validateGroupAuthoringDraft(draft)).toEqual({
            valid: false,
            fieldErrors: {
                name: 'Name is required',
                members: 'Add at least one member',
            },
        });
    });

    test('moves members through a non-drag path and builds the save model', () => {
        const initial = createGroupAuthoringDraft({
            name: 'Night Shift',
            members: ['A.png', 'B.png', 'C.png'],
        });
        const moved = moveGroupAuthoringMember(initial, 'C.png', 'up');
        const movedAgain = moveGroupAuthoringMember(moved, 'C.png', 'up');

        expect(movedAgain.members).toEqual(['C.png', 'A.png', 'B.png']);
        expect(getGroupAuthoringDirtyFields(initial, movedAgain)).toEqual(['members']);
        expect(createGroupAuthoringSaveModel(movedAgain)).toMatchObject({
            name: 'Night Shift',
            members: ['C.png', 'A.png', 'B.png'],
            tag_ids: [],
        });
    });

    test('runs a group authoring session with non-drag member edits and legacy write-through submit payload', () => {
        const session = createGroupAuthoringSession({
            id: 'group-1',
            name: 'Night Shift',
            members: ['A.png', 'B.png'],
            disabled_members: ['B.png'],
        });

        const empty = session.update({ members: [] });
        expect(empty.submit()).toEqual({
            ok: false,
            fieldErrors: {
                members: 'Add at least one member',
            },
        });

        const edited = session
            .removeMember('A.png')
            .addMember('C.png')
            .moveMember('C.png', 'up')
            .update({ name: 'Late Shift' });

        expect(edited.dirty).toBe(true);
        expect(edited.dirtyFields).toEqual(['name', 'members']);
        expect(edited.draft.members).toEqual(['C.png', 'B.png']);
        expect(edited.submit()).toEqual({
            ok: true,
            action: 'saveGroupAuthoring',
            payload: {
                id: 'group-1',
                name: 'Late Shift',
                avatar_url: '',
                members: ['C.png', 'B.png'],
                disabled_members: ['B.png'],
                fav: false,
                allow_self_responses: false,
                hideMutedSprites: false,
                activation_strategy: 0,
                generation_mode: 0,
                auto_mode_delay: 5,
                generation_mode_join_prefix: '',
                generation_mode_join_suffix: '',
                tag_ids: [],
            },
        });

        expect(edited.cancel().draft.members).toEqual(['A.png', 'B.png']);
    });

    test('deduplicates add-member draft operations before save', () => {
        const session = createGroupAuthoringSession({
            name: 'Night Shift',
            members: ['A.png'],
        });

        const edited = session.addMember('B.png').addMember('B.png');

        expect(edited.draft.members).toEqual(['A.png', 'B.png']);
        expect(edited.submit()).toMatchObject({
            ok: true,
            payload: {
                members: ['A.png', 'B.png'],
            },
        });
    });
});
