const express = require("express");

const {
    createOrder,
    getMyOrders,
    getMyOrderById,
    getAllOrders,
    getAdminOrderById,
    updateOrderStatus,
    trackMyOrder,
    confirmCodOrder,
} = require("../controllers/orderController");
const {
    cancelOrder,
    requestCancellation,
    getCancellationRequests,
    reviewCancellationRequest,
} = require("../controllers/cancellationController");
const {
    requestReturn,
    getReturnRequests,
    reviewReturnRequest,
    markReturnAsReturned,
} = require("../controllers/returnController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();


// =============================
// CUSTOMER ROUTES
// =============================

router.post(
    "/checkout",
    authMiddleware,
    authorizeRoles("customer"),
    createOrder
);

router.get(
    "/my-orders",
    authMiddleware,
    authorizeRoles("customer"),
    getMyOrders
);

router.get(
    "/my-orders/:id/tracking",
    authMiddleware,
    authorizeRoles("customer"),
    trackMyOrder
);

router.post(
    "/my-orders/:id/cancel-request",
    authMiddleware,
    authorizeRoles("customer"),
    requestCancellation
);

router.post(
    "/my-orders/:id/return-request",
    authMiddleware,
    authorizeRoles("customer"),
    requestReturn
);

router.get(
    "/my-orders/:id",
    authMiddleware,
    authorizeRoles("customer"),
    getMyOrderById
);


// =============================
// ADMIN - CANCELLATION REQUESTS
// Specific routes muna
// =============================

router.get(
    "/admin/cancellation-requests",
    authMiddleware,
    authorizeRoles("admin"),
    getCancellationRequests
);

router.patch(
    "/admin/cancellation-requests/:id",
    authMiddleware,
    authorizeRoles("admin"),
    reviewCancellationRequest
);

router.get(
    "/admin/return-requests",
    authMiddleware,
    authorizeRoles("admin"),
    getReturnRequests
);

router.patch(
    "/admin/return-requests/:id",
    authMiddleware,
    authorizeRoles("admin"),
    reviewReturnRequest
);


// =============================
// ADMIN - ORDERS
// =============================

router.get(
    "/admin",
    authMiddleware,
    authorizeRoles("admin"),
    getAllOrders
);

router.patch(
    "/admin/:id/status",
    authMiddleware,
    authorizeRoles("admin"),
    updateOrderStatus
);

router.patch(
    "/admin/:id/confirm-cod",
    authMiddleware,
    authorizeRoles("admin"),
    confirmCodOrder
);

router.patch(
    "/admin/:id/cancel",
    authMiddleware,
    authorizeRoles("admin"),
    cancelOrder
);

router.patch(
    "/admin/return-requests/:id/returned",
    authMiddleware,
    authorizeRoles("admin"),
    markReturnAsReturned
);

// Dynamic route LAST
router.get(
    "/admin/:id",
    authMiddleware,
    authorizeRoles("admin"),
    getAdminOrderById
);


module.exports = router;