import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('background domain and library services', () => {
    test('domain module owns pure catalog projection helpers without DOM access', async () => {
        const domain = await import(`../public/scripts/background-domain.js?t=${Date.now()}`);

        expect(domain.getBackgroundPath('Forest.png')).toBe('backgrounds/Forest.png');
        expect(domain.generateUrlParameter('Forest.png', false)).toBe('url("backgrounds/Forest.png")');
        expect(domain.generateUrlParameter('user/chat/bg.png', true)).toContain('user/chat/bg.png');
        expect(domain.isAnimatedBackgroundExtension('clip.mp4')).toBe(true);
        expect(domain.isAnimatedBackgroundExtension('still.png')).toBe(false);

        const sorted = domain.sortBackgrounds(['zeta.png', 'Alpha.png', 'beta.png'], {
            sortOrder: domain.BG_SORT_OPTIONS.AZ,
        });
        expect(sorted).toEqual(['Alpha.png', 'beta.png', 'zeta.png']);

        const filtered = domain.filterBackgroundTitles(
            [
                { filename: 'Forest Day.png', title: 'Forest Day' },
                { filename: 'City Night.png', title: 'City Night' },
            ],
            'forest',
        );
        expect(filtered.map(item => item.filename)).toEqual(['Forest Day.png']);

        const folderImages = domain.getFilteredImagesByFolder(
            [
                { filename: 'a.png', isAnimated: false },
                { filename: 'b.png', isAnimated: true },
            ],
            'folder-1',
            { 'a.png': ['folder-1'], 'b.png': ['folder-2'] },
        );
        expect(folderImages.map(item => item.filename)).toEqual(['a.png']);

        const replacement = domain.resolveReplacementFilename(
            ['one.png', 'two.png', 'three.png'],
            'two.png',
        );
        expect(replacement).toBe('three.png');
        expect(domain.resolveReplacementFilename(['only.png'], 'only.png')).toBeNull();

        const gallery = domain.buildBackgroundGalleryItems(
            [{ filename: 'Forest.png', isAnimated: false }],
            ['chat/bg.png'],
            {
                selectedName: 'Forest.png',
                lockedUrl: domain.generateUrlParameter('chat/bg.png', true),
                sortOrder: domain.BG_SORT_OPTIONS.AZ,
                filterQuery: '',
            },
        );
        expect(gallery.system).toHaveLength(1);
        expect(gallery.system[0]).toMatchObject({
            id: 'Forest.png',
            selected: true,
            isCustom: false,
        });
        expect(gallery.chat[0]).toMatchObject({
            id: 'chat/bg.png',
            locked: true,
            isCustom: true,
        });

        const source = read('public/scripts/background-domain.js');
        expect(source).not.toMatch(/\$\(|document\.|jQuery|#bg_menu_content/i);
    });

    test('library service owns load/select/lock/upload/rename/delete/refresh without gallery DOM', async () => {
        const service = await import(`../public/scripts/background-library-service.js?t=${Date.now()}`);

        /** @type {{name: string, url: string, sortOrder: string, animation: boolean, fitting: string}} */
        const settings = {
            name: '__transparent.png',
            url: 'url("backgrounds/__transparent.png")',
            sortOrder: 'az',
            animation: false,
            fitting: 'classic',
        };
        /** @type {Record<string, any>} */
        const chatMetadata = {};
        let savedSettingsCount = 0;
        let savedMetadataCount = 0;
        let systemImages = [
            { filename: '__transparent.png', isAnimated: false },
            { filename: 'Forest.png', isAnimated: false },
            { filename: 'City.png', isAnimated: true },
        ];
        /** @type {Array<{id: string, name: string, thumbnailFile: string}>} */
        let folders = [{ id: 'f1', name: 'Nature', thumbnailFile: 'Forest.png' }];
        /** @type {Record<string, string[]>} */
        let imageFolderMap = { 'Forest.png': ['f1'] };
        /** @type {string[]} */
        const deleted = [];
        /** @type {Array<{oldBg: string, newBg: string}>} */
        const renames = [];
        /** @type {Array<{filename: string, isCustom: boolean}>} */
        const uploads = [];

        const session = service.createBackgroundLibrarySession({
            getSettings: () => settings,
            setSettings: next => {
                Object.assign(settings, next);
            },
            saveSettings: async () => {
                savedSettingsCount += 1;
            },
            saveSettingsDebounced: () => {
                savedSettingsCount += 1;
            },
            getChatMetadata: () => chatMetadata,
            setChatMetadataValue: (key, value) => {
                chatMetadata[key] = value;
            },
            deleteChatMetadataValue: key => {
                delete chatMetadata[key];
            },
            saveMetadata: async () => {
                savedMetadataCount += 1;
            },
            saveMetadataDebounced: () => {
                savedMetadataCount += 1;
            },
            getCurrentChatId: () => 'chat-1',
            fetchSystemCatalog: async () => ({
                images: structuredClone(systemImages),
                config: { width: 160, height: 90 },
            }),
            fetchFolders: async () => ({
                folders: structuredClone(folders),
                imageFolderMap: structuredClone(imageFolderMap),
            }),
            fetchImageMetadata: async () => ({
                images: {
                    'backgrounds/Forest.png': { addedTimestamp: 20, dominantColor: '#111' },
                    'backgrounds/City.png': { addedTimestamp: 10, dominantColor: '#222' },
                    'backgrounds/__transparent.png': { addedTimestamp: 1 },
                },
            }),
            deleteSystemBackground: async filename => {
                deleted.push(filename);
                systemImages = systemImages.filter(item => item.filename !== filename);
            },
            renameSystemBackground: async (oldBg, newBg) => {
                renames.push({ oldBg, newBg });
                const found = systemImages.find(item => item.filename === oldBg);
                if (found) {
                    found.filename = newBg;
                }
                if (imageFolderMap[oldBg]) {
                    imageFolderMap[newBg] = imageFolderMap[oldBg];
                    delete imageFolderMap[oldBg];
                }
            },
            uploadSystemBackground: async formData => {
                const filename = String(formData?.get?.('filename') || formData?.filename || 'upload.png');
                uploads.push({ filename, isCustom: false });
                systemImages.push({ filename, isAnimated: false });
                return { path: filename };
            },
            uploadChatBackground: async formData => {
                const filename = String(formData?.get?.('filename') || formData?.filename || 'chat-upload.png');
                uploads.push({ filename, isCustom: true });
                const list = chatMetadata.chat_backgrounds || [];
                list.push(filename);
                chatMetadata.chat_backgrounds = list;
                return { path: filename };
            },
            deleteMediaFromServer: async () => {},
            generateQuietPrompt: async () => 'Forest',
            onVisualBackgroundChange: () => {},
        });

        await session.loadCatalog();
        let snapshot = session.getSnapshot();
        expect(snapshot.isLoading).toBe(false);
        expect(snapshot.systemBackgrounds.map(item => item.filename)).toEqual(
            expect.arrayContaining(['Forest.png', 'City.png', '__transparent.png']),
        );
        expect(snapshot.folders).toHaveLength(1);

        session.applyFilter('forest');
        expect(session.getSnapshot().filterQuery).toBe('forest');
        expect(session.getReactPanelState().systemBackgrounds.map(item => item.id)).toEqual(['Forest.png']);

        session.applySort('za');
        expect(settings.sortOrder).toBe('za');
        expect(savedSettingsCount).toBeGreaterThan(0);

        session.enterFolder('f1');
        expect(session.getSnapshot().activeFolderId).toBe('f1');
        expect(session.getReactPanelState().systemBackgrounds.map(item => item.id)).toEqual(['Forest.png']);
        session.exitFolder();
        expect(session.getSnapshot().activeFolderId).toBeNull();

        session.applyFilter('');
        const selected = await session.selectBackground('Forest.png', 'global');
        expect(selected.ok).toBe(true);
        expect(settings.name).toBe('Forest.png');
        expect(settings.url).toContain('Forest.png');

        const lockResult = session.lockCurrentBackground();
        expect(lockResult.ok).toBe(true);
        expect(chatMetadata.custom_background).toContain('Forest.png');

        const unlockResult = session.unlockCurrentBackground();
        expect(unlockResult.ok).toBe(true);
        expect(chatMetadata.custom_background).toBeUndefined();

        const uploadResult = await session.uploadBackground({ filename: 'New.png' }, { source: 'global' });
        expect(uploadResult.ok).toBe(true);
        expect(uploads.some(item => item.filename === 'New.png' && !item.isCustom)).toBe(true);
        expect(session.getSnapshot().systemBackgrounds.some(item => item.filename === 'New.png')).toBe(true);

        await session.selectBackground('New.png', 'global');
        const renameResult = await session.renameBackground('New.png', 'Renamed.png', { source: 'global' });
        expect(renameResult.ok).toBe(true);
        expect(settings.name).toBe('Renamed.png');
        expect(renames).toContainEqual({ oldBg: 'New.png', newBg: 'Renamed.png' });

        const deleteResult = await session.deleteBackground('Renamed.png', { source: 'global' });
        expect(deleteResult.ok).toBe(true);
        expect(deleted).toContain('Renamed.png');
        expect(settings.name).not.toBe('Renamed.png');
        expect(session.getSnapshot().systemBackgrounds.some(item => item.filename === 'Renamed.png')).toBe(false);

        systemImages.push({ filename: 'Late.png', isAnimated: false });
        await session.refresh();
        expect(session.getSnapshot().systemBackgrounds.some(item => item.filename === 'Late.png')).toBe(true);

        // Failed delete keeps recoverable catalog state and does not claim success.
        systemImages = [
            { filename: '__transparent.png', isAnimated: false },
            { filename: 'Forest.png', isAnimated: false },
            { filename: 'City.png', isAnimated: true },
            { filename: 'Late.png', isAnimated: false },
        ];
        const previousCount = systemImages.length;
        const baseDeps = session.getDeps();
        const failSession = service.createBackgroundLibrarySession({
            ...baseDeps,
            deleteSystemBackground: async () => {
                throw new Error('delete failed');
            },
        });
        await failSession.loadCatalog();
        const failedDelete = await failSession.deleteBackground('Forest.png', { source: 'global' });
        expect(failedDelete.ok).toBe(false);
        expect(failSession.getSnapshot().systemBackgrounds).toHaveLength(previousCount);

        const source = read('public/scripts/background-library-service.js');
        expect(source).not.toMatch(/\$\(|document\.|#bg_menu_content|#bg_custom_content/i);
        expect(source).not.toContain('createThumbnailElement');
    });

    test('backgrounds facade reuses domain and library service modules', () => {
        const source = read('public/scripts/backgrounds.js');
        expect(source).toContain("from './background-domain.js'");
        expect(source).toContain("from './background-library-service.js'");
        expect(source).toContain('createBackgroundLibrarySession');
        expect(source).toContain('sortBackgrounds');
        // Pure path/url helpers should not re-own encoding once extracted.
        expect(source).not.toMatch(/function getBackgroundPath\(fileUrl\) \{[\s\S]*?return `backgrounds\/\$\{encodeURIComponent/);
    });
});

    test('backgrounds slash callbacks share the exported service-backed lock/unlock/auto helpers', () => {
        const source = read('public/scripts/backgrounds.js');
        expect(source).toContain("name: 'lockbg'");
        expect(source).toContain('lockCurrentBackground();');
        expect(source).toContain("name: 'unlockbg'");
        expect(source).toContain('unlockCurrentBackground();');
        expect(source).toContain("name: 'autobg'");
        expect(source).toContain('await runAutoBackgroundSelection();');
        // No direct legacy click owners in slash registration.
        const lockCommandSlice = source.slice(source.indexOf("name: 'lockbg'"), source.indexOf("name: 'unlockbg'"));
        expect(lockCommandSlice).not.toContain('onLockBackgroundClick();');
        const unlockCommandSlice = source.slice(source.indexOf("name: 'unlockbg'"), source.indexOf("name: 'autobg'"));
        expect(unlockCommandSlice).not.toContain('onUnlockBackgroundClick();');
    });
