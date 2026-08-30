const pool = require("../config/db");
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
    returnRequestTemplate,
    returnApprovedTemplate,
    returnRejectedTemplate,
    returnCompletedTemplate,
} = require("../services/emailTemplates");


// ========================================
// CUSTOMER - REQUEST RETURN
// ========================================

const requestReturn = async (req, res) => {
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

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "Return reason is required",
            });
        }

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

        // Customer must receive the order first.
        if (order.order_status !== "delivered") {
            return res.status(400).json({
                success: false,
                message:
                    "Return request is only available for delivered orders",
            });
        }

        // COD must already be recorded as paid before return.
        if (
            order.payment_method === "COD" &&
            order.payment_status !== "paid"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "COD payment must be confirmed before requesting a return",
            });
        }

        // Online payments should also be successful before return.
        if (
            order.payment_method !== "COD" &&
            order.payment_status !== "paid"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Payment must be completed before requesting a return",
            });
        }

        const existingRequest = await pool.query(
            `SELECT id, status
             FROM return_requests
             WHERE order_id = $1`,
            [parsedOrderId]
        );

        if (existingRequest.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "A return request already exists for this order",
                status: existingRequest.rows[0].status,
            });
        }

        const result = await pool.query(
            `INSERT INTO return_requests
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
                reason.trim()
            ]
        );

        try {
            sendEmail({
                to: order.email,

                subject:
                    `YOCANA Return Request Received - ${order.order_number}`,

                text:
                    `Hi ${order.first_name}, we received your return request ` +
                    `for order ${order.order_number}. ` +
                    `Your request is currently pending review.`,

                html: returnRequestTemplate({
                    customer: order,
                    order,
                    reason: reason.trim(),
                }),
            }).catch((error) => {
                console.error(
                    "Return request email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Return request email template error:",
                emailError
            );
        }

        res.status(201).json({
            success: true,
            message:
                "Return request submitted successfully",
            return_request: result.rows[0],
        });

    } catch (error) {
        console.error(
            "Request return error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// ADMIN - VIEW RETURN REQUESTS
// ========================================

const getReturnRequests = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                rr.id,
                rr.order_id,
                rr.reason,
                rr.status,
                rr.admin_note,
                rr.requested_at,
                rr.reviewed_at,
                rr.returned_at,
                rr.is_resellable,
                rr.inspection_note,
                rr.inspected_at,
                o.order_number,
                o.order_status,
                o.payment_method,
                o.payment_status,
                u.first_name,
                u.last_name,
                u.email
             FROM return_requests rr
             JOIN orders o
                ON o.id = rr.order_id
             JOIN users u
                ON u.id = rr.user_id
             ORDER BY rr.requested_at DESC`
        );

        res.json({
            success: true,
            return_requests: result.rows,
        });

    } catch (error) {
        console.error(
            "Get return requests error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// ADMIN - APPROVE / REJECT RETURN
// ========================================

const reviewReturnRequest = async (req, res) => {
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
                message: "Invalid return request ID",
            });
        }

        const {
            action,
            admin_note
        } = req.body || {};

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Action must be approve or reject",
            });
        }

        await client.query("BEGIN");

        const requestResult = await client.query(
            `SELECT
                rr.*,
                o.order_number,
                o.order_status,
                o.payment_status,
                o.payment_method,
                u.first_name,
                u.last_name,
                u.email
             FROM return_requests rr
             JOIN orders o
                ON o.id = rr.order_id
             JOIN users u
                ON u.id = rr.user_id
             WHERE rr.id = $1
             FOR UPDATE`,
            [parsedRequestId]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Return request not found",
            });
        }

        const returnRequest =
            requestResult.rows[0];

        if (returnRequest.status !== "pending") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Return request has already been reviewed",
            });
        }

        const newStatus =
            action === "approve"
                ? "approved"
                : "rejected";

        const result = await client.query(
            `UPDATE return_requests
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
                parsedRequestId
            ]
        );

        await client.query("COMMIT");

        // ========================================
        // SEND RETURN REVIEW EMAIL
        // ========================================

        try {
            const customer = {
                first_name: returnRequest.first_name,
                last_name: returnRequest.last_name,
                email: returnRequest.email,
            };

            const order = {
                order_number: returnRequest.order_number,
            };

            if (action === "approve") {
                sendEmail({
                    to: returnRequest.email,

                    subject:
                        `YOCANA Return Approved - ${returnRequest.order_number}`,

                    text:
                        `Hi ${returnRequest.first_name}, your return request ` +
                        `for order ${returnRequest.order_number} has been approved.`,

                    html: returnApprovedTemplate({
                        customer,
                        order,
                        reason: returnRequest.reason,
                        adminNote: admin_note || null,
                    }),
                }).catch((error) => {
                    console.error(
                        "Return approved email error:",
                        error
                    );
                });
            }

            if (action === "reject") {
                sendEmail({
                    to: returnRequest.email,

                    subject:
                        `YOCANA Return Request Update - ${returnRequest.order_number}`,

                    text:
                        `Hi ${returnRequest.first_name}, your return request ` +
                        `for order ${returnRequest.order_number} was not approved.`,

                    html: returnRejectedTemplate({
                        customer,
                        order,
                        reason: returnRequest.reason,
                        adminNote: admin_note || null,
                    }),
                }).catch((error) => {
                    console.error(
                        "Return rejected email error:",
                        error
                    );
                });
            }

        } catch (emailError) {
            console.error(
                "Return review email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message:
                action === "approve"
                    ? "Return request approved"
                    : "Return request rejected",
            return_request: result.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Review return request error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });

    } finally {
        client.release();
    }
};


// ========================================
// ADMIN - RECEIVE / INSPECT RETURN
// ========================================

const markReturnAsReturned = async (req, res) => {
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
                message: "Invalid return request ID",
            });
        }

        const {
            is_resellable,
            inspection_note
        } = req.body || {};

        if (typeof is_resellable !== "boolean") {
            return res.status(400).json({
                success: false,
                message:
                    "is_resellable must be true or false",
            });
        }

        await client.query("BEGIN");

        const requestResult = await client.query(
            `SELECT
                rr.*,
                o.order_number,
                o.order_status,
                o.payment_status,
                o.payment_method,
                u.first_name,
                u.last_name,
                u.email
            FROM return_requests rr
            JOIN orders o
                ON o.id = rr.order_id
            JOIN users u
                ON u.id = rr.user_id
            WHERE rr.id = $1
            FOR UPDATE`,
            [parsedRequestId]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Return request not found",
            });
        }

        const returnRequest =
            requestResult.rows[0];

        if (returnRequest.status !== "approved") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Only approved return requests can be marked as returned",
            });
        }

        if (returnRequest.order_status !== "delivered") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Only delivered orders can complete the return process",
            });
        }

        // Payment should still be paid before finalizing the return.
        if (returnRequest.payment_status !== "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Only paid orders can complete the return process",
            });
        }

        // Restore stock only if returned item can be sold again.
        if (is_resellable) {
            await restoreOrderStock(
                client,
                returnRequest.order_id,
                req.user.id,
                "returned"
            );
        }

        const updatedRequest = await client.query(
            `UPDATE return_requests
             SET status = 'returned',
                 returned_at = CURRENT_TIMESTAMP,
                 is_resellable = $1,
                 inspection_note = $2,
                 inspected_by = $3,
                 inspected_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [
                is_resellable,
                inspection_note || null,
                req.user.id,
                parsedRequestId
            ]
        );

        await client.query(
            `UPDATE orders
             SET order_status = 'returned',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [returnRequest.order_id]
        );

        const historyNote = is_resellable
            ? "Returned item received and restored to inventory"
            : "Returned item received but not restored to sellable inventory";

        await addOrderStatusHistory(
            client,
            returnRequest.order_id,
            "returned",
            historyNote,
            req.user.id
        );

        await client.query("COMMIT");

        // ========================================
        // SEND RETURN COMPLETED EMAIL
        // ========================================

        try {
            sendEmail({
                to: returnRequest.email,

                subject:
                    `YOCANA Return Completed - ${returnRequest.order_number}`,

                text:
                    `Hi ${returnRequest.first_name}, your returned ` +
                    `YOCANA order ${returnRequest.order_number} ` +
                    `has been received and inspected successfully.`,

                html: returnCompletedTemplate({
                    customer: returnRequest,

                    order: {
                        order_number:
                            returnRequest.order_number,
                    },

                    isResellable: is_resellable,

                    inspectionNote:
                        inspection_note || null,
                }),
            }).catch((error) => {
                console.error(
                    "Return completed email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Return completed email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message: is_resellable
                ? "Return completed and stock restored"
                : "Return completed. Item was not restored to sellable stock",
            return_request:
                updatedRequest.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Mark return as returned error:",
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


module.exports = {
    requestReturn,
    getReturnRequests,
    reviewReturnRequest,
    markReturnAsReturned,
};