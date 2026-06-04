export function createWorldInfoImportResult(status, file, worldName = null, { unprocessed = false, reason = null } = {}) {
    const result = {
        status,
        fileName: file?.name ?? null,
        worldName,
    };

    if (unprocessed) {
        result.unprocessed = true;
    }

    if (reason) {
        result.reason = reason;
    }

    return result;
}

export function summarizeWorldInfoBatchImport(results) {
    const summary = {
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        unprocessedCount: 0,
        totalCount: results.length,
    };

    for (const result of results) {
        if (result?.unprocessed) {
            summary.unprocessedCount++;
        } else if (result?.status === 'success') {
            summary.successCount++;
        } else if (result?.status === 'failed') {
            summary.failedCount++;
        } else if (result?.status === 'cancelled' || result?.status === 'skipped') {
            summary.skippedCount++;
        }
    }

    return summary;
}
