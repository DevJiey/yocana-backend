const express = require("express");

const {
    getAllCustomers,
    getCustomerById,
} = require("../controllers/customerController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

// GET ALL CUSTOMERS
router.get(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    getAllCustomers
);

// GET ONE CUSTOMER + ORDER HISTORY
router.get(
    "/:id",
    authMiddleware,
    authorizeRoles("admin"),
    getCustomerById
);

module.exports = router;