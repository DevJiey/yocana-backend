const pool = require("../config/db");
const {
    markOnlinePaymentAsPaid,
} = require("../services/paymentService");
const {
    sendEmail,
} = require("../services/emailService");

const {
    paymentSuccessfulTemplate,
} = require("../services/emailTemplates");

const createPayment = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.id;
        const { order_id } = req.body || {};

        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: "order_id is required",
            });
        }
        const parsedOrderId = Number(order_id);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }

        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT *
             FROM orders
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [parsedOrderId, userId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        if (order.order_status === "cancelled") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Cannot create payment for a cancelled order",
            });
        }

        // Check if payment already exists
        const existingPayment = await client.query(
            `SELECT *
             FROM payments
             WHERE order_id = $1
             ORDER BY id DESC
             LIMIT 1`,
            [parsedOrderId]
        );

        if (existingPayment.rows.length > 0) {
            await client.query("COMMIT");

            return res.json({
                success: true,
                message: "Payment record already exists",
                payment: existingPayment.rows[0],
            });
        }

        const paymentResult = await client.query(
            `INSERT INTO payments
            (
                order_id,
                user_id,
                payment_method,
                amount,
                status
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                order.id,
                userId,
                order.payment_method,
                order.total_amount,
                "pending"
            ]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Payment record created successfully",
            payment: paymentResult.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Create payment error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });

    } finally {
        client.release();
    }
};


const getMyPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId } = req.params;
        const parsedOrderId = Number(orderId);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }

        const result = await pool.query(
            `SELECT
                p.id,
                p.order_id,
                o.order_number,
                p.payment_method,
                p.amount,
                p.status,
                p.transaction_reference,
                p.gateway,
                p.paid_at,
                p.failed_at,
                p.created_at
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.order_id = $1
             AND p.user_id = $2
             ORDER BY p.id DESC
             LIMIT 1`,
            [parsedOrderId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        res.json({
            success: true,
            payment: result.rows[0],
        });

    } catch (error) {
        console.error("Get payment error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const confirmCodPayment = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const parsedPaymentId = Number(id);

        if (
            !Number.isInteger(parsedPaymentId) ||
            parsedPaymentId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment ID",
            });
        }
        const { transaction_reference } = req.body || {};

        await client.query("BEGIN");

        const paymentResult = await client.query(
            `SELECT
                p.*,
                o.order_number,
                o.order_status,
                o.payment_status AS order_payment_status,
                u.first_name,
                u.last_name,
                u.email
            FROM payments p
            JOIN orders o
                ON o.id = p.order_id
            JOIN users u
                ON u.id = p.user_id
            WHERE p.id = $1
            FOR UPDATE`,
            [parsedPaymentId]
        );

        if (paymentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        const payment = paymentResult.rows[0];

        if (payment.payment_method !== "COD") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "This endpoint is for COD payments only",
            });
        }

        if (payment.status === "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "COD payment has already been confirmed",
            });
        }

        if (payment.order_status !== "delivered") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "COD payment can only be confirmed after the order is delivered",
            });
        }

        const reference =
            transaction_reference ||
            `COD-${payment.order_id}-${Date.now()}`;

        const updatedPayment = await client.query(
            `UPDATE payments
             SET status = 'paid',
                 transaction_reference = $1,
                 paid_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [reference, parsedPaymentId]
        );

        await client.query(
            `UPDATE orders
             SET payment_status = 'paid',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [payment.order_id]
        );

        await client.query("COMMIT");

        // ========================================
        // SEND PAYMENT SUCCESSFUL EMAIL
        // ========================================

        try {
            const paidPayment =
                updatedPayment.rows[0];

            sendEmail({
                to: payment.email,

                subject:
                    `YOCANA Payment Successful - ${payment.order_number}`,

                text:
                    `Hi ${payment.first_name}, your payment ` +
                    `for order ${payment.order_number} has been ` +
                    `successfully recorded.`,

                html: paymentSuccessfulTemplate({
                    customer: payment,

                    order: {
                        order_number:
                            payment.order_number,
                    },

                    payment: paidPayment,
                }),
            }).catch((error) => {
                console.error(
                    "COD payment email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "COD payment email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message: "COD payment confirmed successfully",
            payment: updatedPayment.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Confirm COD payment error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });

    } finally {
        client.release();
    }
};

const initializeOnlinePayment = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.id;
        const { order_id } = req.body || {};

        if (!order_id) {
            return res.status(400).json({
                success: false,
                message: "order_id is required",
            });
        }
        const parsedOrderId = Number(order_id);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }

        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT *
             FROM orders
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [parsedOrderId, userId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        if (order.payment_method === "COD") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "COD orders do not use online payment initialization",
            });
        }

        if (
            !["GCASH", "MAYA", "CARD", "BANK"].includes(
                order.payment_method
            )
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Unsupported online payment method",
            });
        }

        if (order.order_status === "cancelled") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Cannot initialize payment for a cancelled order",
            });
        }

        let paymentResult = await client.query(
            `SELECT *
             FROM payments
             WHERE order_id = $1
             FOR UPDATE`,
            [parsedOrderId]
        );

        let payment;

        if (paymentResult.rows.length === 0) {
            const createdPayment = await client.query(
                `INSERT INTO payments
                (
                    order_id,
                    user_id,
                    payment_method,
                    amount,
                    status
                )
                VALUES ($1, $2, $3, $4, 'pending')
                RETURNING *`,
                [
                    order.id,
                    userId,
                    order.payment_method,
                    order.total_amount
                ]
            );

            payment = createdPayment.rows[0];
        } else {
            payment = paymentResult.rows[0];
        }

        if (payment.status === "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Payment has already been completed",
            });
        }

        /*
            REAL PAYMENT GATEWAY WILL BE CALLED HERE LATER.

            Example future flow:

            const gatewayResponse =
                await paymentGateway.createPayment({
                    amount: payment.amount,
                    method: payment.payment_method,
                    orderNumber: order.order_number
                });

            Then we would receive:
            gateway_payment_id
            payment_url
        */

        const temporaryPaymentUrl = null;

        const updatedPayment = await client.query(
            `UPDATE payments
             SET status = 'pending',
                 payment_url = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [
                temporaryPaymentUrl,
                payment.id
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message:
                "Online payment record initialized. Payment gateway integration is not yet connected.",
            payment: updatedPayment.rows[0],
            gateway_connected: false,
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Initialize online payment error:",
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

const simulateOnlinePaymentSuccess = async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const parsedPaymentId = Number(id);

        if (
            !Number.isInteger(parsedPaymentId) ||
            parsedPaymentId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment ID",
            });
        }

        await client.query("BEGIN");

        const paymentResult = await client.query(
            `SELECT
                p.*,
                o.order_number,
                u.first_name,
                u.last_name,
                u.email
            FROM payments p
            JOIN orders o
                ON o.id = p.order_id
            JOIN users u
                ON u.id = p.user_id
            WHERE p.id = $1
            FOR UPDATE`,
            [parsedPaymentId]
        );

        if (paymentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        const payment = paymentResult.rows[0];

        if (payment.payment_method === "COD") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "COD payments cannot use online payment confirmation",
            });
        }

        if (payment.status === "paid") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Payment is already paid",
            });
        }

        const updatedPayment =
            await markOnlinePaymentAsPaid(
                client,
                payment,
                {
                    transaction_reference:
                        `TEST-ONLINE-${Date.now()}`,
                    gateway: "DEVELOPMENT_TEST",
                    gateway_payment_id:
                        `TEST-${payment.id}`,
                }
            );

        await client.query("COMMIT");

        // ========================================
        // SEND PAYMENT SUCCESSFUL EMAIL
        // ========================================

        try {
            sendEmail({
                to: payment.email,

                subject:
                    `YOCANA Payment Successful - ${payment.order_number}`,

                text:
                    `Hi ${payment.first_name}, your payment ` +
                    `for order ${payment.order_number} has been ` +
                    `successfully completed.`,

                html: paymentSuccessfulTemplate({
                    customer: payment,

                    order: {
                        order_number:
                            payment.order_number,
                    },

                    payment: updatedPayment,
                }),
            }).catch((error) => {
                console.error(
                    "Online payment email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Online payment email template error:",
                emailError
            );
        }

        res.json({
            success: true,
            message:
                "Development payment simulation completed successfully",
            payment: updatedPayment,
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Simulate online payment error:",
            error
        );

        res.status(400).json({
            success: false,
            message: error.message || "Payment simulation failed",
        });

    } finally {
        client.release();
    }
};

const getAdminPaymentByOrderId = async (req, res) => {
    try {
        const { orderId } = req.params;
        const parsedOrderId = Number(orderId);

        if (
            !Number.isInteger(parsedOrderId) ||
            parsedOrderId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID",
            });
        }

        const result = await pool.query(
            `SELECT
                p.id,
                p.order_id,
                o.order_number,
                p.payment_method,
                p.amount,
                p.status,
                p.transaction_reference,
                p.gateway,
                p.gateway_payment_id,
                p.paid_at,
                p.failed_at,
                p.created_at,
                p.updated_at
             FROM payments p
             JOIN orders o
                ON o.id = p.order_id
             WHERE p.order_id = $1
             ORDER BY p.id DESC
             LIMIT 1`,
            [parsedOrderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        res.json({
            success: true,
            payment: result.rows[0],
        });

    } catch (error) {
        console.error(
            "Get admin payment by order error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to load payment",
        });
    }
};

const getAdminPayments = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                p.id,
                p.order_id,
                o.order_number,
                p.user_id,
                CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
                u.email AS customer_email,
                p.payment_method,
                p.amount,
                p.status,
                p.transaction_reference,
                p.gateway,
                p.gateway_payment_id,
                p.paid_at,
                p.failed_at,
                p.created_at,
                p.updated_at
            FROM payments p
            JOIN orders o
                ON o.id = p.order_id
            JOIN users u
                ON u.id = p.user_id
            WHERE p.payment_method IN (
                'GCASH',
                'MAYA',
                'CARD',
                'BANK'
            )
            ORDER BY p.created_at DESC`
        )

        res.json({
            success: true,
            payments: result.rows,
        })
    } catch (error) {
        console.error(
            "Get admin payments error:",
            error
        )

        res.status(500).json({
            success: false,
            message: "Failed to load payments",
        })
    }
}

module.exports = {
    createPayment,
    getMyPayment,
    confirmCodPayment,
    initializeOnlinePayment,
    simulateOnlinePaymentSuccess,
    getAdminPaymentByOrderId,
    getAdminPayments,
};