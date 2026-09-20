import express from 'express';

export const STATS_RETIRED_ERROR = 'stats_feature_removed';
export const STATS_RETIRED_MESSAGE = 'Usage stats functionality has been removed from EmberDesk.';

/**
 * Stable JSON body for retired stats endpoints.
 * @returns {{error: string, message: string}}
 */
export function getStatsRetiredBody() {
    return {
        error: STATS_RETIRED_ERROR,
        message: STATS_RETIRED_MESSAGE,
    };
}

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json(getStatsRetiredBody());
});
