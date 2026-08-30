const express = require("express");

const {
    getAdminDashboard,
} = require("../controllers/adminDashboardController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/dashboard",
    authMiddleware,
    authorizeRoles("admin"),
    getAdminDashboard
);

module.exports = router;