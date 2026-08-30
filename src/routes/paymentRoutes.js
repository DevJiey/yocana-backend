const express = require("express");

const {
    createPayment,
    getMyPayment,
    confirmCodPayment,
    initializeOnlinePayment,
    simulateOnlinePaymentSuccess,
    getAdminPaymentByOrderId,
    getAdminPayments,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/",
    authMiddleware,
    authorizeRoles("customer"),
    createPayment
);

router.get(
    "/order/:orderId",
    authMiddleware,
    authorizeRoles("customer"),
    getMyPayment
);

router.patch(
    "/admin/:id/confirm-cod",
    authMiddleware,
    authorizeRoles("admin"),
    confirmCodPayment
);

router.post(
    "/online/initialize",
    authMiddleware,
    authorizeRoles("customer"),
    initializeOnlinePayment
);

router.patch(
    "/admin/:id/simulate-online-success",
    authMiddleware,
    authorizeRoles("admin"),
    simulateOnlinePaymentSuccess
);

router.get(
    "/admin",
    authMiddleware,
    authorizeRoles("admin"),
    getAdminPayments
)

router.get(
    "/admin/order/:orderId",
    authMiddleware,
    authorizeRoles("admin"),
    getAdminPaymentByOrderId
);

module.exports = router;