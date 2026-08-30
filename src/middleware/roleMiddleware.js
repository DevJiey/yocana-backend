const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Access forbidden. You do not have permission.",
            });
        }

        next();
    };
};

module.exports = authorizeRoles;