const express = require("express");

const {
    getReportOverview,
    getSalesReport,
    getOrdersReport,
    getInventoryReport,
} = require("../controllers/reportController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/overview",
    authMiddleware,
    authorizeRoles("admin"),
    getReportOverview
);

router.get(
    "/sales",
    authMiddleware,
    authorizeRoles("admin"),
    getSalesReport
);

router.get(
    "/orders",
    authMiddleware,
    authorizeRoles("admin"),
    getOrdersReport
);

router.get(
    "/inventory",
    authMiddleware,
    authorizeRoles("admin"),
    getInventoryReport
);

module.exports = router;