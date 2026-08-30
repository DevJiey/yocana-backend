const express = require("express");

const {
    sendTestEmail,
} = require("../controllers/emailController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/test",
    authMiddleware,
    authorizeRoles("admin"),
    sendTestEmail
);

module.exports = router;