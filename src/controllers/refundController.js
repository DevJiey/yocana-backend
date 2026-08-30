const pool = require("../config/db");
const {
    sendEmail,
} = require("../services/emailService");

const {
    refundProcessedTemplate,
} = require("../services/emailTemplates");

// ========================================
// ADMIN - CREATE REFUND RECORD
// ========================================

const createRefund = async (req, res) => {
    const client = await pool.connect();

    try {
        const { order_id } = req.body || {};

        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: "order_id is required",
            });
        }

        await client.query("BEGIN");

        // Lock and get order
        const orderResult = await client.query(
            `SELECT *
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [order_id]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        // Order must already be fully returned
        if (order.order_status !== "returned") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Refund can only be created for returned orders",
            });
        }

        // Customer must have actually paid first
        if (order.payment_status !== "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Refund can only be created for paid orders",
            });
        }

        // Get completed return request
        const returnResult = await client.query(
            `SELECT *
             FROM return_requests
             WHERE order_id = $1
             AND status = 'returned'
             FOR UPDATE`,
            [order_id]
        );

        if (returnResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Order does not have a completed return",
            });
        }

        const returnRequest =
            returnResult.rows[0];

        // Make sure actual payment transaction exists
        const paymentResult = await client.query(
            `SELECT *
             FROM payments
             WHERE order_id = $1
             FOR UPDATE`,
            [order_id]
        );

        if (paymentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "No payment record found for this order",
            });
        }

        const payment = paymentResult.rows[0];

        if (payment.status !== "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Payment transaction must be paid before a refund can be created",
            });
        }

        // Prevent duplicate refund
        const existingRefund = await client.query(
            `SELECT id, status
             FROM refunds
             WHERE order_id = $1`,
            [order_id]
        );

        if (existingRefund.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message:
                    "A refund record already exists for this order",
                refund_status:
                    existingRefund.rows[0].status,
            });
        }

        /*
            V1:
            Full refund muna tayo, so amount is based
            on the amount actually recorded as paid.

            Later pwede natin dagdagan:
            - partial refunds
            - non-refundable shipping fees
            - promo/discount adjustments
        */
        const refundAmount =
            Number(order.subtotal) -
            Number(order.discount_amount || 0);

        const result = await client.query(
            `INSERT INTO refunds
            (
                order_id,
                return_request_id,
                amount,
                refund_method,
                status
            )
            VALUES ($1, $2, $3, $4, 'pending')
            RETURNING *`,
            [
                order.id,
                returnRequest.id,
                refundAmount,
                order.payment_method
            ]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message:
                "Refund record created successfully",
            refund: result.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Create refund error:",
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
// ADMIN - PROCESS REFUND
// ========================================

const processRefund = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        const {
            reference_number,
            admin_note
        } = req.body || {};

        await client.query("BEGIN");

        // Get refund + order
        const refundResult = await client.query(
            `SELECT
                r.*,
                o.order_number,
                o.order_status,
                o.payment_status,
                o.payment_method,
                u.first_name,
                u.last_name,
                u.email
            FROM refunds r
            JOIN orders o
                ON o.id = r.order_id
            JOIN users u
                ON u.id = o.user_id
            WHERE r.id = $1
            FOR UPDATE`,
            [id]
        );

        if (refundResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message:
                    "Refund record not found",
            });
        }

        const refund = refundResult.rows[0];

        if (refund.status === "refunded") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Refund has already been processed",
            });
        }

        if (refund.status !== "pending") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Only pending refunds can be processed",
            });
        }

        if (refund.order_status !== "returned") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Only returned orders can be refunded",
            });
        }

        if (refund.payment_status !== "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Order payment must still be marked as paid before processing the refund",
            });
        }

        // Lock corresponding payment
        const paymentResult = await client.query(
            `SELECT *
             FROM payments
             WHERE order_id = $1
             FOR UPDATE`,
            [refund.order_id]
        );

        if (paymentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Payment record not found for this order",
            });
        }

        const payment = paymentResult.rows[0];

        if (payment.status !== "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Payment record must be paid before it can be refunded",
            });
        }

        // Internal reference if admin doesn't provide one
        const reference =
            reference_number ||
            `REFUND-${refund.order_id}-${Date.now()}`;

        // Update refund
        const updatedRefund =
            await client.query(
                `UPDATE refunds
                 SET status = 'refunded',
                     reference_number = $1,
                     admin_note = $2,
                     processed_by = $3,
                     processed_at = CURRENT_TIMESTAMP
                 WHERE id = $4
                 RETURNING *`,
                [
                    reference,
                    admin_note || null,
                    req.user.id,
                    id
                ]
            );

        // Update order payment status
        await client.query(
            `UPDATE orders
             SET payment_status = 'refunded',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [refund.order_id]
        );

        // Keep actual payment transaction consistent
        await client.query(
            `UPDATE payments
             SET status = 'refunded',
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1`,
            [refund.order_id]
        );

        await client.query("COMMIT");

        // ========================================
        // SEND REFUND PROCESSED EMAIL
        // ========================================

        try {
            const processedRefund =
                updatedRefund.rows[0];

            sendEmail({
                to: refund.email,

                subject:
                    `YOCANA Refund Processed - ${refund.order_number}`,

                text:
                    `Hi ${refund.first_name}, your refund ` +
                    `for order ${refund.order_number} has been ` +
                    `successfully processed.`,

                html: refundProcessedTemplate({
                    customer: refund,

                    order: {
                        order_number:
                            refund.order_number,
                    },

                    refund: processedRefund,
                }),
            }).catch((error) => {
                console.error(
                    "Refund processed email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Refund processed email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message:
                "Refund processed successfully",
            refund: updatedRefund.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Process refund error:",
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


module.exports = {
    createRefund,
    processRefund,
};