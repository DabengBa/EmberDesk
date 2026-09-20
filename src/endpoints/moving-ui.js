import express from 'express';

export const MOVING_UI_RETIRED_ERROR = 'moving_ui_feature_removed';
export const MOVING_UI_RETIRED_MESSAGE = 'MovingUI functionality has been removed from EmberDesk.';

/**
 * Stable JSON body for retired movingUI endpoints.
 * @returns {{error: string, message: string}}
 */
export function getMovingUiRetiredBody() {
    return {
        error: MOVING_UI_RETIRED_ERROR,
        message: MOVING_UI_RETIRED_MESSAGE,
    };
}

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json(getMovingUiRetiredBody());
});
