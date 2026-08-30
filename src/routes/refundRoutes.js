const express = require("express");

const {
    createRefund,
    processRefund,
} = require("../controllers/refundController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    createRefund
);

router.patch(
    "/:id/process",
    authMiddleware,
    authorizeRoles("admin"),
    processRefund
);

module.exports = router;