function round(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.round(value * 100) / 100;
}

function percentile(sortedValues, ratio) {
    if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
        return null;
    }

    if (sortedValues.length === 1) {
        return round(sortedValues[0]);
    }

    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const index = Math.ceil(sortedValues.length * clampedRatio) - 1;
    return round(sortedValues[Math.max(0, index)]);
}

function median(sortedValues) {
    if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
        return null;
    }

    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 1) {
        return round(sortedValues[middle]);
    }

    return round((sortedValues[middle - 1] + sortedValues[middle]) / 2);
}

function collectNumericMetric(samples, metricName) {
    return samples
        .map(sample => sample?.timing?.[metricName])
        .filter(value => typeof value === 'number' && Number.isFinite(value))
        .sort((left, right) => left - right);
}

function collectBooleanMetric(samples, metricName) {
    return samples
        .map(sample => sample?.timing?.[metricName])
        .filter(value => typeof value === 'boolean');
}

export function summarizeInteractionSamples(samples) {
    const browserMs = collectNumericMetric(samples, 'browserMs');
    const serverRouteMs = collectNumericMetric(samples, 'serverRouteMs');
    const deleteFlowMs = collectNumericMetric(samples, 'deleteFlowMs');
    const deleteRequestMs = collectNumericMetric(samples, 'deleteRequestMs');
    const preDeleteChatLookupMs = collectNumericMetric(samples, 'preDeleteChatLookupMs');
    const groupsRefreshMs = collectNumericMetric(samples, 'groupsRefreshMs');
    const characterPrintMs = collectNumericMetric(samples, 'characterPrintMs');
    const characterPageLoadedLagMs = collectNumericMetric(samples, 'characterPageLoadedLagMs');
    const firstListItemVisibleMs = collectNumericMetric(samples, 'firstListItemVisibleMs');
    const firstListItemClickableMs = collectNumericMetric(samples, 'firstListItemClickableMs');
    const filterInputToPageLoadedMs = collectNumericMetric(samples, 'filterInputToPageLoadedMs');
    const filterInputToBusyClearMs = collectNumericMetric(samples, 'filterInputToBusyClearMs');
    const firstReadableMessageMs = collectNumericMetric(samples, 'firstReadableMessageMs');
    const sendToLocalEchoMs = collectNumericMetric(samples, 'sendToLocalEchoMs');
    const firstTokenMs = collectNumericMetric(samples, 'firstTokenMs');
    const streamStopToUsableMs = collectNumericMetric(samples, 'streamStopToUsableMs');
    const loadMoreToStableMs = collectNumericMetric(samples, 'loadMoreToStableMs');
    const paginationScrollRestored = collectBooleanMetric(samples, 'paginationScrollRestored');

    return {
        sampleCount: samples.length,
        browserMs: summarizeMetric(browserMs),
        serverRouteMs: summarizeMetric(serverRouteMs),
        deleteFlowMs: summarizeMetric(deleteFlowMs),
        deleteRequestMs: summarizeMetric(deleteRequestMs),
        preDeleteChatLookupMs: summarizeMetric(preDeleteChatLookupMs),
        groupsRefreshMs: summarizeMetric(groupsRefreshMs),
        characterPrintMs: summarizeMetric(characterPrintMs),
        characterPageLoadedLagMs: summarizeMetric(characterPageLoadedLagMs),
        firstListItemVisibleMs: summarizeMetric(firstListItemVisibleMs),
        firstListItemClickableMs: summarizeMetric(firstListItemClickableMs),
        filterInputToPageLoadedMs: summarizeMetric(filterInputToPageLoadedMs),
        filterInputToBusyClearMs: summarizeMetric(filterInputToBusyClearMs),
        firstReadableMessageMs: summarizeMetric(firstReadableMessageMs),
        sendToLocalEchoMs: summarizeMetric(sendToLocalEchoMs),
        firstTokenMs: summarizeMetric(firstTokenMs),
        streamStopToUsableMs: summarizeMetric(streamStopToUsableMs),
        loadMoreToStableMs: summarizeMetric(loadMoreToStableMs),
        paginationScrollRestored: summarizeBooleanMetric(paginationScrollRestored),
    };
}

function summarizeMetric(values) {
    return {
        median: median(values),
        p90: percentile(values, 0.9),
        min: values.length ? round(values[0]) : null,
        max: values.length ? round(values[values.length - 1]) : null,
    };
}

function summarizeBooleanMetric(values) {
    const trueCount = values.filter(Boolean).length;
    const falseCount = values.length - trueCount;

    return {
        sampleCount: values.length,
        trueCount,
        falseCount,
        allTrue: values.length === 0 ? null : falseCount === 0,
    };
}

export function buildVariantComparison(onSamples, offSamples) {
    const onSummary = summarizeInteractionSamples(onSamples);
    const offSummary = summarizeInteractionSamples(offSamples);

    return {
        sqliteOn: onSummary,
        sqliteOff: offSummary,
        delta: {
            browserMsMedian: calculateDelta(onSummary.browserMs.median, offSummary.browserMs.median),
            serverRouteMsMedian: calculateDelta(onSummary.serverRouteMs.median, offSummary.serverRouteMs.median),
            deleteFlowMsMedian: calculateDelta(onSummary.deleteFlowMs.median, offSummary.deleteFlowMs.median),
            deleteRequestMsMedian: calculateDelta(onSummary.deleteRequestMs.median, offSummary.deleteRequestMs.median),
            preDeleteChatLookupMsMedian: calculateDelta(onSummary.preDeleteChatLookupMs.median, offSummary.preDeleteChatLookupMs.median),
            groupsRefreshMsMedian: calculateDelta(onSummary.groupsRefreshMs.median, offSummary.groupsRefreshMs.median),
            characterPrintMsMedian: calculateDelta(onSummary.characterPrintMs.median, offSummary.characterPrintMs.median),
            characterPageLoadedLagMsMedian: calculateDelta(onSummary.characterPageLoadedLagMs.median, offSummary.characterPageLoadedLagMs.median),
            firstListItemVisibleMsMedian: calculateDelta(onSummary.firstListItemVisibleMs.median, offSummary.firstListItemVisibleMs.median),
            firstListItemClickableMsMedian: calculateDelta(onSummary.firstListItemClickableMs.median, offSummary.firstListItemClickableMs.median),
            filterInputToPageLoadedMsMedian: calculateDelta(onSummary.filterInputToPageLoadedMs.median, offSummary.filterInputToPageLoadedMs.median),
            filterInputToBusyClearMsMedian: calculateDelta(onSummary.filterInputToBusyClearMs.median, offSummary.filterInputToBusyClearMs.median),
            firstReadableMessageMsMedian: calculateDelta(onSummary.firstReadableMessageMs.median, offSummary.firstReadableMessageMs.median),
            sendToLocalEchoMsMedian: calculateDelta(onSummary.sendToLocalEchoMs.median, offSummary.sendToLocalEchoMs.median),
            firstTokenMsMedian: calculateDelta(onSummary.firstTokenMs.median, offSummary.firstTokenMs.median),
            streamStopToUsableMsMedian: calculateDelta(onSummary.streamStopToUsableMs.median, offSummary.streamStopToUsableMs.median),
            loadMoreToStableMsMedian: calculateDelta(onSummary.loadMoreToStableMs.median, offSummary.loadMoreToStableMs.median),
        },
    };
}

function sanitizeCharacterIndexStatus(status) {
    if (!status || typeof status !== 'object') {
        return null;
    }

    const disabledReason = status.disabledReason ?? null;
    return {
        mode: status.mode ?? null,
        supported: Boolean(status.supported),
        open: Boolean(status.open),
        indexedPathObserved: Boolean(status.indexedPathObserved),
        schemaVersion: typeof status.schemaVersion === 'number' ? status.schemaVersion : null,
        resetCount: typeof status.resetCount === 'number' ? status.resetCount : 0,
        disabledReason,
        fallbackReason: disabledReason ?? (status.supported ? null : 'filesystem_fallback'),
    };
}

export function buildDerivedCacheObservabilitySummary(scenarios) {
    const summary = {};

    for (const scenario of scenarios ?? []) {
        for (const pair of scenario?.pairs ?? []) {
            for (const variant of pair?.variants ?? []) {
                const sanitizedStatus = sanitizeCharacterIndexStatus(variant.characterIndex);
                if (!sanitizedStatus) {
                    continue;
                }

                const variantName = variant.variant ?? 'unknown';
                summary[variantName] ??= [];
                summary[variantName].push({
                    scenario: scenario.scenario ?? null,
                    ...sanitizedStatus,
                });
            }
        }
    }

    return summary;
}

export function renderDerivedCacheObservabilityMarkdown(summary) {
    const lines = ['## Derived Cache Observability', ''];
    const variantNames = Object.keys(summary ?? {}).sort();

    if (variantNames.length === 0) {
        return [...lines, '- No character-index sidecar status was recorded.'].join('\n');
    }

    for (const variantName of variantNames) {
        for (const status of summary[variantName] ?? []) {
            const details = [
                `mode=${status.mode ?? 'unknown'}`,
                `supported=${status.supported}`,
                `open=${status.open}`,
                `indexedPathObserved=${status.indexedPathObserved}`,
                `schema=${status.schemaVersion ?? 'n/a'}`,
                `resets=${status.resetCount ?? 0}`,
                `fallback=${status.fallbackReason ?? 'none'}`,
            ].join(', ');
            lines.push(`- ${variantName} / ${status.scenario ?? 'unknown'}: ${details}`);
        }
    }

    return lines.join('\n');
}

function calculateDelta(onValue, offValue) {
    if (typeof onValue !== 'number' || typeof offValue !== 'number') {
        return null;
    }

    return {
        absoluteMs: round(onValue - offValue),
        relativePct: offValue === 0 ? null : round(((onValue - offValue) / offValue) * 100),
    };
}

function toComparableCharacterSummary(item) {
    return {
        avatar: item?.avatar ?? '',
        name: item?.name ?? '',
        fav: Boolean(item?.fav),
        chat_size: Number(item?.chat_size ?? 0),
        date_last_chat: Number(item?.date_last_chat ?? 0),
        data_size: Number(item?.data_size ?? 0),
        tags: Array.isArray(item?.tags) ? [...item.tags] : [],
        shallow: Boolean(item?.shallow),
        data: {
            name: item?.data?.name ?? '',
            character_version: item?.data?.character_version ?? '',
            creator: item?.data?.creator ?? '',
            creator_notes: item?.data?.creator_notes ?? '',
            tags: Array.isArray(item?.data?.tags) ? [...item.data.tags] : [],
            extensions: {
                fav: Boolean(item?.data?.extensions?.fav),
                world: item?.data?.extensions?.world ?? '',
            },
        },
    };
}

function normalizeCharacterListPayload(payload) {
    if (!Array.isArray(payload)) {
        return null;
    }

    return payload
        .map(item => toComparableCharacterSummary(item))
        .sort((left, right) => String(left.avatar).localeCompare(String(right.avatar)));
}

function normalizeDeleteRefreshPayload(payload, { includeMetrics = false } = {}) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const normalized = {
        deletedAvatar: payload.deletedAvatar ?? '',
        characterCountBefore: Number(payload.characterCountBefore ?? 0),
        characterCountAfter: Number(payload.characterCountAfter ?? 0),
        groupCountAfter: Number(payload.groupCountAfter ?? 0),
        renderedCharacterCount: Number(payload.renderedCharacterCount ?? 0),
        renderedGroupCount: Number(payload.renderedGroupCount ?? 0),
    };

    if (includeMetrics) {
        normalized.metrics = {
            deleteFlowMs: round(Number(payload.metrics?.deleteFlowMs ?? 0)),
            deleteRequestMs: round(Number(payload.metrics?.deleteRequestMs ?? 0)),
            preDeleteChatLookupMs: round(Number(payload.metrics?.preDeleteChatLookupMs ?? 0)),
            groupsRefreshMs: round(Number(payload.metrics?.groupsRefreshMs ?? 0)),
            characterPrintMs: round(Number(payload.metrics?.characterPrintMs ?? 0)),
            characterPageLoadedLagMs: round(Number(payload.metrics?.characterPageLoadedLagMs ?? 0)),
        };
    }

    return normalized;
}

function normalizeCharacterLibraryUxPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    return {
        query: payload.query ?? '',
        renderedCharacterCount: Number(payload.renderedCharacterCount ?? 0),
        renderedGroupCount: Number(payload.renderedGroupCount ?? 0),
        firstListItemClickable: Boolean(payload.firstListItemClickable),
        busyCleared: Boolean(payload.busyCleared),
        pageLoaded: Boolean(payload.pageLoaded),
        paginationScrollRestored: typeof payload.paginationScrollRestored === 'boolean'
            ? payload.paginationScrollRestored
            : null,
    };
}

function normalizeMainChatPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    return {
        characterName: payload.characterName ?? '',
        messageCount: Number(payload.messageCount ?? 0),
        renderedMessageCount: Number(payload.renderedMessageCount ?? 0),
        firstMesid: Number(payload.firstMesid ?? 0),
        lastMesid: Number(payload.lastMesid ?? 0),
        firstReadableMessageText: payload.firstReadableMessageText ?? '',
        localEchoPresent: Boolean(payload.localEchoPresent),
        finalTextPresent: Boolean(payload.finalTextPresent),
        stopRestoredUsable: Boolean(payload.stopRestoredUsable),
        loadMoreBeforeMesid: Number(payload.loadMoreBeforeMesid ?? 0),
        loadMoreAfterMesid: Number(payload.loadMoreAfterMesid ?? 0),
    };
}

function normalizeCharacterGetPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    return {
        avatar: payload.avatar ?? '',
        name: payload.name ?? '',
        fav: Boolean(payload.fav),
        chat_size: Number(payload.chat_size ?? 0),
        date_last_chat: Number(payload.date_last_chat ?? 0),
        data_size: Number(payload.data_size ?? 0),
        tags: Array.isArray(payload.tags) ? [...payload.tags] : [],
        data: {
            name: payload?.data?.name ?? '',
            character_version: payload?.data?.character_version ?? '',
            creator: payload?.data?.creator ?? '',
            creator_notes: payload?.data?.creator_notes ?? '',
            tags: Array.isArray(payload?.data?.tags) ? [...payload.data.tags] : [],
            extensions: {
                fav: Boolean(payload?.data?.extensions?.fav),
                world: payload?.data?.extensions?.world ?? '',
            },
            character_book: normalizeCharacterBook(payload?.data?.character_book),
        },
    };
}

function normalizeCharacterBook(book) {
    if (!book || typeof book !== 'object') {
        return null;
    }

    return {
        name: book.name ?? '',
        description: book.description ?? '',
        scan_depth: Number(book.scan_depth ?? 0),
        token_budget: Number(book.token_budget ?? 0),
        recursive_scanning: Boolean(book.recursive_scanning),
        entries: Array.isArray(book.entries)
            ? book.entries.map(entry => ({
                uid: Number(entry?.uid ?? 0),
                key: entry?.key ?? '',
                content: entry?.content ?? '',
                comment: entry?.comment ?? '',
                order: Number(entry?.order ?? 0),
                position: Number(entry?.position ?? 0),
                disable: Boolean(entry?.disable),
                selective: Boolean(entry?.selective),
            }))
            : [],
    };
}

export function compareScenarioPayloads(scenarioName, sqliteOnPayload, sqliteOffPayload) {
    let normalizedOn;
    let normalizedOff;

    if (scenarioName.startsWith('characters_all')) {
        normalizedOn = normalizeCharacterListPayload(sqliteOnPayload);
        normalizedOff = normalizeCharacterListPayload(sqliteOffPayload);
    } else if (scenarioName.startsWith('character_delete_refresh')) {
        normalizedOn = normalizeDeleteRefreshPayload(sqliteOnPayload);
        normalizedOff = normalizeDeleteRefreshPayload(sqliteOffPayload);
    } else if (scenarioName.startsWith('characters_get')) {
        normalizedOn = normalizeCharacterGetPayload(sqliteOnPayload);
        normalizedOff = normalizeCharacterGetPayload(sqliteOffPayload);
    } else if (scenarioName.startsWith('character_library_')) {
        normalizedOn = normalizeCharacterLibraryUxPayload(sqliteOnPayload);
        normalizedOff = normalizeCharacterLibraryUxPayload(sqliteOffPayload);
    } else if (scenarioName.startsWith('main_chat_')) {
        normalizedOn = normalizeMainChatPayload(sqliteOnPayload);
        normalizedOff = normalizeMainChatPayload(sqliteOffPayload);
    } else {
        normalizedOn = sqliteOnPayload ?? null;
        normalizedOff = sqliteOffPayload ?? null;
    }

    const matches = JSON.stringify(normalizedOn) === JSON.stringify(normalizedOff);

    return {
        matches,
        normalizedOn,
        normalizedOff,
    };
}

export function summarizeScenarioPayload(scenarioName, payload) {
    if (scenarioName.startsWith('characters_all')) {
        const normalizedList = normalizeCharacterListPayload(payload) ?? [];
        const avatars = normalizedList.map(item => item.avatar);
        return {
            rowCount: normalizedList.length,
            firstAvatar: avatars[0] ?? null,
            lastAvatar: avatars[avatars.length - 1] ?? null,
            sampleAvatars: avatars.slice(0, 3),
        };
    }

    if (scenarioName.startsWith('characters_get')) {
        const normalizedItem = normalizeCharacterGetPayload(payload);
        return normalizedItem ? {
            avatar: normalizedItem.avatar,
            name: normalizedItem.name,
            chat_size: normalizedItem.chat_size,
            date_last_chat: normalizedItem.date_last_chat,
            hasCharacterBook: Boolean(normalizedItem.data.character_book),
        } : null;
    }

    if (scenarioName.startsWith('character_delete_refresh')) {
        return normalizeDeleteRefreshPayload(payload, { includeMetrics: true });
    }

    if (scenarioName.startsWith('character_library_')) {
        return normalizeCharacterLibraryUxPayload(payload);
    }

    if (scenarioName.startsWith('main_chat_')) {
        return normalizeMainChatPayload(payload);
    }

    return null;
}

export function validateInteractionPath(scenarioName, variant, observedPath) {
    const expectations = {
        characters_all_first_build: {
            sqlite_on: 'characters_all:indexed',
            sqlite_off: 'characters_all:filesystem',
        },
        characters_all_warm_repeat: {
            sqlite_on: 'characters_all:indexed',
            sqlite_off: 'characters_all:filesystem',
        },
        characters_get_warm_repeat: {
            sqlite_on: 'characters_get:indexed',
            sqlite_off: 'characters_get:filesystem',
        },
        characters_all_after_chat_dirty: {
            sqlite_on: 'characters_all:indexed',
            sqlite_off: 'characters_all:filesystem',
        },
        character_delete_refresh_ui: {
            sqlite_on: null,
            sqlite_off: null,
        },
        character_library_first_interactive: {
            sqlite_on: null,
            sqlite_off: null,
        },
        character_library_filter_response: {
            sqlite_on: null,
            sqlite_off: null,
        },
        character_library_pagination_scroll: {
            sqlite_on: null,
            sqlite_off: null,
        },
        main_chat_warm_open_first_readable: {
            sqlite_on: null,
            sqlite_off: null,
        },
        main_chat_send_local_echo: {
            sqlite_on: null,
            sqlite_off: null,
        },
        main_chat_stream_first_token: {
            sqlite_on: null,
            sqlite_off: null,
        },
        main_chat_stream_stop_to_usable: {
            sqlite_on: null,
            sqlite_off: null,
        },
        main_chat_long_load_more: {
            sqlite_on: null,
            sqlite_off: null,
        },
    };

    const expectedPath = expectations[scenarioName]?.[variant] ?? null;

    return {
        expectedPath,
        matches: expectedPath === null ? true : expectedPath === observedPath,
    };
}
