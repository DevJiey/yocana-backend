const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided.",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const result = await pool.query(
            `
            SELECT token_version
            FROM users
            WHERE id = $1
            `,
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        const currentTokenVersion =
            result.rows[0].token_version;

        if (
            Number(decoded.token_version || 0) !==
            Number(currentTokenVersion)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
};

module.exports = authMiddleware;