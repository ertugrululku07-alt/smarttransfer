/**
 * Lightweight request body validation without external dependencies.
 */

function requireFields(body, fields) {
    const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
    if (missing.length > 0) {
        const err = new Error(`Missing required fields: ${missing.join(', ')}`);
        err.status = 400;
        throw err;
    }
}

function validateBody(requiredFields = []) {
    return (req, res, next) => {
        try {
            requireFields(req.body || {}, requiredFields);
            next();
        } catch (err) {
            res.status(err.status || 400).json({ success: false, error: err.message });
        }
    };
}

module.exports = { requireFields, validateBody };
