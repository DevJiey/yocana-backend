const pool = require("../config/db")
const {
    restoreOrderStock,
} = require("../services/inventoryService");
const {
    addOrderStatusHistory,
} = require("../services/orderHistoryService");
const {
    sendEmail,
} = require("../services/emailService");
const {
    cancellationRequestTemplate,
    cancellationApprovedTemplate,
    cancellationRejectedTemplate,
} = require("../services/emailTemplates");


// ========================================
// CUSTOMER - REQUEST CANCELLATION
// ========================================

const requestCancellation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const parsedOrderId = Number(id);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }
        const { reason } = req.body || {};

        // ========================================
        // VALIDATE REASON
        // ========================================

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "Cancellation reason is required",
            });
        }

        // ========================================
        // GET CUSTOMER ORDER
        // ========================================

        const orderResult = await pool.query(
            `SELECT
                o.*,
                u.first_name,
                u.last_name,
                u.email
             FROM orders o
             JOIN users u
                ON u.id = o.user_id
             WHERE o.id = $1
             AND o.user_id = $2`,
            [parsedOrderId, userId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        // ========================================
        // CHECK ORDER STATUS
        // ========================================

        if (
            order.order_status === "shipped" ||
            order.order_status === "delivered"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "This order can no longer be cancelled. Please use the return process.",
            });
        }

        if (order.order_status === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Order is already cancelled",
            });
        }

        // ========================================
        // CHECK EXISTING CANCELLATION REQUEST
        // ========================================

        const existingRequest = await pool.query(
            `SELECT id, status
             FROM cancellation_requests
             WHERE order_id = $1`,
            [parsedOrderId]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "A cancellation request already exists for this order",
                status: existingRequest.rows[0].status,
            });
        }

        // ========================================
        // CREATE CANCELLATION REQUEST
        // ========================================

        const result = await pool.query(
            `INSERT INTO cancellation_requests
            (
                order_id,
                user_id,
                reason
            )
            VALUES ($1, $2, $3)
            RETURNING *`,
            [
                parsedOrderId,
                userId,
                reason.trim(),
            ]
        );

        // ========================================
        // SEND CANCELLATION REQUEST EMAIL
        // ========================================

        try {
            sendEmail({
                to: order.email,

                subject:
                    `YOCANA Cancellation Request Received - ${order.order_number}`,

                text:
                    `Hi ${order.first_name}, we received your cancellation ` +
                    `request for order ${order.order_number}. ` +
                    `Your request is currently pending review.`,

                html: cancellationRequestTemplate({
                    customer: order,
                    order,
                    reason: reason.trim(),
                }),
            }).catch((error) => {
                console.error(
                    "Cancellation request email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Cancellation request email template error:",
                emailError
            );
        }

        // ========================================
        // RESPONSE
        // ========================================

        res.status(201).json({
            success: true,
            message:
                "Cancellation request submitted successfully",
            cancellation_request: result.rows[0],
        });

    } catch (error) {
        console.error(
            "Request cancellation error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// ADMIN - VIEW CANCELLATION REQUESTS
// ========================================

const getCancellationRequests = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                cr.id,
                cr.order_id,
                cr.reason,
                cr.status,
                cr.admin_note,
                cr.requested_at,
                cr.reviewed_at,
                o.order_number,
                o.order_status,
                o.payment_method,
                o.payment_status,
                u.first_name,
                u.last_name,
                u.email
             FROM cancellation_requests cr
             JOIN orders o
                ON o.id = cr.order_id
             JOIN users u
                ON u.id = cr.user_id
             ORDER BY cr.requested_at DESC`
        );

        res.json({
            success: true,
            cancellation_requests: result.rows,
        });

    } catch (error) {
        console.error(
            "Get cancellation requests error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// ADMIN - APPROVE / REJECT REQUEST
// ========================================

const reviewCancellationRequest = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const parsedRequestId = Number(id);

        if (
            !Number.isInteger(parsedRequestId) ||
            parsedRequestId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid cancellation request ID",
            });
        }

        const {
            action,
            admin_note,
        } = req.body || {};

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message:
                    "Action must be approve or reject",
            });
        }

        await client.query("BEGIN");

        // ========================================
        // GET CANCELLATION REQUEST
        // ========================================

        const requestResult = await client.query(
            `SELECT
                cr.*,
                o.order_number,
                o.order_status,
                o.payment_status,
                u.first_name,
                u.last_name,
                u.email
            FROM cancellation_requests cr
            JOIN orders o
            ON o.id = cr.order_id
            JOIN users u
            ON u.id = cr.user_id
            WHERE cr.id = $1
            FOR UPDATE`,
            [parsedRequestId]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message:
                    "Cancellation request not found",
            });
        }

        const cancellationRequest =
            requestResult.rows[0];

        // ========================================
        // CHECK REQUEST STATUS
        // ========================================

        if (
            cancellationRequest.status !== "pending"
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Cancellation request has already been reviewed",
            });
        }

        // ========================================
        // APPROVE CANCELLATION
        // ========================================

        if (action === "approve") {

            if (
                cancellationRequest.order_status ===
                "shipped" ||
                cancellationRequest.order_status ===
                "delivered"
            ) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Order can no longer be cancelled",
                });
            }

            // Restore stock only if stock was already deducted
            if (
                cancellationRequest.order_status ===
                "preparing"
            ) {
                await restoreOrderStock(
                    client,
                    cancellationRequest.order_id,
                    req.user.id
                );
            }

            // Update actual order status
            await client.query(
                `UPDATE orders
                 SET order_status = 'cancelled',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [cancellationRequest.order_id]
            );

            // Add order status history
            await addOrderStatusHistory(
                client,
                cancellationRequest.order_id,
                "cancelled",
                "Cancellation request approved",
                req.user.id
            );
        }

        // ========================================
        // UPDATE CANCELLATION REQUEST STATUS
        // ========================================

        const newStatus =
            action === "approve"
                ? "approved"
                : "rejected";

        const updatedRequest = await client.query(
            `UPDATE cancellation_requests
             SET status = $1,
                 admin_note = $2,
                 reviewed_by = $3,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [
                newStatus,
                admin_note || null,
                req.user.id,
                parsedRequestId,
            ]
        );

        await client.query("COMMIT");

        // ========================================
        // SEND CANCELLATION REVIEW EMAIL
        // ========================================

        try {
            const customer = {
                first_name: cancellationRequest.first_name,
                last_name: cancellationRequest.last_name,
                email: cancellationRequest.email,
            };

            const order = {
                order_number:
                    cancellationRequest.order_number,
            };

            if (action === "approve") {
                sendEmail({
                    to: cancellationRequest.email,

                    subject:
                        `YOCANA Cancellation Approved - ${cancellationRequest.order_number}`,

                    text:
                        `Hi ${cancellationRequest.first_name}, ` +
                        `your cancellation request for order ` +
                        `${cancellationRequest.order_number} has been approved.`,

                    html: cancellationApprovedTemplate({
                        customer,
                        order,
                        reason:
                            cancellationRequest.reason,
                        adminNote:
                            admin_note || null,
                    }),
                }).catch((error) => {
                    console.error(
                        "Cancellation approved email error:",
                        error
                    );
                });
            }

            if (action === "reject") {
                sendEmail({
                    to: cancellationRequest.email,

                    subject:
                        `YOCANA Cancellation Request Update - ${cancellationRequest.order_number}`,

                    text:
                        `Hi ${cancellationRequest.first_name}, ` +
                        `your cancellation request for order ` +
                        `${cancellationRequest.order_number} was not approved.`,

                    html: cancellationRejectedTemplate({
                        customer,
                        order,
                        reason:
                            cancellationRequest.reason,
                        adminNote:
                            admin_note || null,
                    }),
                }).catch((error) => {
                    console.error(
                        "Cancellation rejected email error:",
                        error
                    );
                });
            }

        } catch (emailError) {
            console.error(
                "Cancellation review email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message:
                action === "approve"
                    ? "Cancellation request approved"
                    : "Cancellation request rejected",
            cancellation_request:
                updatedRequest.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Review cancellation request error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                error.message || "Server error",
        });

    } finally {
        client.release();
    }
};


// ========================================
// ADMIN - DIRECT CANCEL ORDER
// ========================================

const cancelOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        const parsedOrderId = Number(id);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }
        const { reason } = req.body || {};

        await client.query("BEGIN");

        // ========================================
        // GET ORDER
        // ========================================

        const orderResult = await client.query(
            `SELECT *
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [parsedOrderId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        // ========================================
        // CHECK ORDER STATUS
        // ========================================

        if (
            order.order_status === "shipped" ||
            order.order_status === "delivered"
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Order can no longer be cancelled. Please use the return process.",
            });
        }

        if (order.order_status === "cancelled") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Order is already cancelled",
            });
        }

        // ========================================
        // RESTORE STOCK IF NEEDED
        // ========================================

        if (order.order_status === "preparing") {
            await restoreOrderStock(
                client,
                order.id,
                req.user.id
            );
        }

        // ========================================
        // CANCEL ORDER
        // ========================================

        const result = await client.query(
            `UPDATE orders
             SET order_status = 'cancelled',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [parsedOrderId]
        );

        // ========================================
        // ADD ORDER HISTORY
        // ========================================

        await addOrderStatusHistory(
            client,
            order.id,
            "cancelled",
            reason
                ? `Order cancelled by admin: ${reason}`
                : "Order cancelled by admin",
            req.user.id
        );

        await client.query("COMMIT");

        // ========================================
        // RESPONSE
        // ========================================

        res.json({
            success: true,
            message:
                "Order cancelled successfully",
            reason: reason || null,
            order: result.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Cancel order error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to cancel order",
        });

    } finally {
        client.release();
    }
};

module.exports = {
    requestCancellation,
    getCancellationRequests,
    reviewCancellationRequest,
    cancelOrder,
};