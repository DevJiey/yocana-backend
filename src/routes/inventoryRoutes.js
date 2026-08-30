const express = require("express");

const {
    getInventory,
    stockIn,
    stockOut,
    getInventoryHistory,
    getLowStockProducts,
} = require("../controllers/inventoryController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    getInventory
);

router.post(
    "/stock-in",
    authMiddleware,
    authorizeRoles("admin"),
    stockIn
);

router.post(
    "/stock-out",
    authMiddleware,
    authorizeRoles("admin"),
    stockOut
);

router.get(
    "/history",
    authMiddleware,
    authorizeRoles("admin"),
    getInventoryHistory
);

router.get(
    "/low-stock",
    authMiddleware,
    authorizeRoles("admin"),
    getLowStockProducts
);

module.exports = router;