/**
 * Pure helpers for React-owned character-library compatible rows.
 * Behavior contract is selector/identity shape, not legacy jQuery ownership.
 */

export interface CharacterLibraryTagModel {
    id: string;
    name: string;
    hiddenOnCard?: boolean;
    forceVisible?: boolean;
}

export interface CharacterLibraryCharacterRowModel {
    type: 'character';
    id: string | number;
    name: string;
    avatar: string;
    avatarUrl: string;
    description?: string;
    auxFieldValue?: string;
    isFav: boolean;
    isActive: boolean;
    isAssistant?: boolean;
    showAvatarUrl?: boolean;
    tags?: CharacterLibraryTagModel[];
    tagsDisplayLimit?: number;
}

export interface CharacterLibraryGroupRowModel {
    type: 'group';
    id: string | number;
    name: string;
    avatarUrl?: string;
    isFav?: boolean;
    isActive?: boolean;
}

export type CharacterLibraryRowModel =
    | CharacterLibraryCharacterRowModel
    | CharacterLibraryGroupRowModel;

export function isCharacterFav(item: { fav?: unknown } | null | undefined): boolean {
    return Boolean(item?.fav || item?.fav === 'true' || item?.fav === true);
}

export function buildCharacterRowClassName({
    isFav,
    isActive,
}: {
    isFav: boolean;
    isActive: boolean;
}): string {
    return `character_select entity_block flex-container wide100p alignitemsflexstart${isFav ? ' is_fav' : ''}${isActive ? ' is_active' : ''}`;
}

export function buildCharacterRowDomId(id: string | number): string {
    return `CharID${id}`;
}

export function selectVisibleCharacterTags(
    tags: CharacterLibraryTagModel[] = [],
    {
        tagsDisplayLimit = 50,
        shouldPrintTag = () => false,
    }: {
        tagsDisplayLimit?: number;
        shouldPrintTag?: (tag: CharacterLibraryTagModel) => boolean;
    } = {},
): { visible: CharacterLibraryTagModel[]; skipped: number } {
    const printable = tags.filter(tag => !tag.hiddenOnCard);
    const mandatory = printable.filter(shouldPrintTag);
    const availableSlots = Math.max(tagsDisplayLimit - mandatory.length, 0);
    let additionalPrinted = 0;
    let skipped = 0;
    const visible: CharacterLibraryTagModel[] = [];

    for (const tag of printable) {
        if (shouldPrintTag(tag) || additionalPrinted++ < availableSlots) {
            visible.push(tag);
        } else {
            skipped++;
        }
    }

    return { visible, skipped };
}

export function projectCharacterEntityToRowModel(
    entity: {
        type: string;
        id: string | number;
        item?: Record<string, unknown>;
    },
    options: {
        activeCharacterId?: string | number | null;
        assistantAvatar?: string | null;
        defaultAvatarUrl?: string;
        showAvatarUrl?: boolean;
        resolveAvatarUrl?: (avatar: string) => string;
        resolveTags?: (id: string | number, item?: Record<string, unknown>) => CharacterLibraryTagModel[];
        auxFieldName?: string;
    } = {},
): CharacterLibraryCharacterRowModel | null {
    if (entity.type !== 'character' || !entity.item) {
        return null;
    }

    const item = entity.item;
    const avatar = String(item.avatar ?? 'none');
    const name = String(item.name ?? '');
    const resolveAvatarUrl = options.resolveAvatarUrl
        ?? ((value: string) => (value === 'none' ? (options.defaultAvatarUrl ?? '') : value));
    const data = (item.data && typeof item.data === 'object')
        ? item.data as Record<string, unknown>
        : {};
    const auxFieldName = options.auxFieldName ?? 'character_version';
    const auxFieldValue = data[auxFieldName] != null ? String(data[auxFieldName]) : '';

    return {
        type: 'character',
        id: entity.id,
        name,
        avatar,
        avatarUrl: resolveAvatarUrl(avatar),
        description: data.creator_notes != null ? String(data.creator_notes) : '',
        auxFieldValue,
        isFav: isCharacterFav(item),
        isActive: options.activeCharacterId != null
            && String(options.activeCharacterId) === String(entity.id),
        isAssistant: options.assistantAvatar != null && avatar === options.assistantAvatar,
        showAvatarUrl: Boolean(options.showAvatarUrl),
        tags: options.resolveTags?.(entity.id, item) ?? [],
    };
}
