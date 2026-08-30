const express = require("express");
const {
    register,
    login,
    getMe,
    updateMe,
    forgotPassword,
    resetPassword,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/me", authMiddleware, getMe);

router.patch(
    "/me",
    authMiddleware,
    authorizeRoles("customer"),
    updateMe
)
router.get(
    "/admin-test",
    authMiddleware,
    authorizeRoles("admin"),
    (req, res) => {
        res.json({
            success: true,
            message: "Admin access granted",
        });
    }
);

module.exports = router;