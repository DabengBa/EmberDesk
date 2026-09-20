import express from 'express';

export const PROVIDER_RETIRED_ERROR = 'provider_feature_removed';
export const PROVIDER_RETIRED_MESSAGE = 'This AI provider integration has been removed from EmberDesk.';

/**
 * Stable JSON body for retired provider endpoints.
 * @returns {{error: string, message: string}}
 */
export function getProviderRetiredBody() {
    return {
        error: PROVIDER_RETIRED_ERROR,
        message: PROVIDER_RETIRED_MESSAGE,
    };
}

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json(getProviderRetiredBody());
});
