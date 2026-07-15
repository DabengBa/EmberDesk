import express from 'express';

export const router = express.Router();

router.use((_request, response) => {
    return response.status(410).json({
        error: 'vector_feature_removed',
        message: 'Built-in vector functionality has been removed from EmberDesk.',
    });
});
