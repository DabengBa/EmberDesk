import express from 'express';

export const UTILITY_FEATURE_RETIRED_ERROR = 'utility_feature_removed';
export const UTILITY_FEATURE_RETIRED_MESSAGE = 'This utility feature has been removed from EmberDesk.';

/**
 * Stable JSON body for retired utility endpoints.
 * @returns {{error: string, message: string}}
 */
export function getUtilityFeatureRetiredBody() {
    return {
        error: UTILITY_FEATURE_RETIRED_ERROR,
        message: UTILITY_FEATURE_RETIRED_MESSAGE,
    };
}

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json(getUtilityFeatureRetiredBody());
});
