const pool = require("../config/db");
const {
    deductOrderStock,
} = require("../services/inventoryService");
const {
    addOrderStatusHistory,
} = require("../services/orderHistoryService");
const {
    sendEmail,
} = require("../services/emailService");
const {
    orderConfirmationTemplate,
    orderShippedTemplate,
    orderDeliveredTemplate,
} = require("../services/emailTemplates");

const createOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.id;

        const {
            address_id,
            payment_method
        } = req.body || {};

        if (!address_id || !payment_method) {
            return res.status(400).json({
                success: false,
                message: "Shipping address and payment method are required",
            });
        }

        const parsedAddressId = Number(address_id);

        if (
            !Number.isInteger(parsedAddressId) ||
            parsedAddressId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid shipping address ID",
            });
        }

        const allowedPaymentMethods = [
            "COD",
            "GCASH",
            "MAYA",
            "CARD",
            "BANK"
        ];

        if (!allowedPaymentMethods.includes(payment_method)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment method",
            });
        }

        await client.query("BEGIN");

        const userResult = await client.query(
            `SELECT
        first_name,
        last_name,
        email
     FROM users
     WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Customer not found",
            });
        }

        const customer = userResult.rows[0];

        const addressResult = await client.query(
            `SELECT
        id,
        recipient_name,
        phone,
        address_line,
        barangay,
        city,
        province,
        postal_code
     FROM customer_addresses
     WHERE id = $1
     AND user_id = $2`,
            [parsedAddressId, userId]
        );

        if (addressResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Invalid shipping address",
            });
        }

        const selectedAddress = addressResult.rows[0];
        const shippingAddress = [
            selectedAddress.recipient_name,
            selectedAddress.phone,
            selectedAddress.address_line,
            selectedAddress.barangay,
            selectedAddress.city,
            selectedAddress.province,
            selectedAddress.postal_code,
        ]
            .filter(Boolean)
            .join(", ");

        const cartResult = await client.query(
            `SELECT
                c.id AS cart_id,
                ci.id AS cart_item_id,
                ci.product_id,
                ci.quantity,
                p.name,
                p.price,
                p.is_active,
                i.current_stock
             FROM carts c
             JOIN cart_items ci ON ci.cart_id = c.id
             JOIN products p ON p.id = ci.product_id
             JOIN inventory i ON i.product_id = p.id
             WHERE c.user_id = $1`,
            [userId]
        );

        if (cartResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Cart is empty",
            });
        }

        for (const item of cartResult.rows) {
            if (!item.is_active) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `${item.name} is currently unavailable`,
                });
            }

            if (item.quantity > item.current_stock) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.name}`,
                    available_stock: item.current_stock,
                });
            }
        }

        const subtotal = cartResult.rows.reduce(
            (total, item) =>
                total + Number(item.price) * item.quantity,
            0
        );

        const province = selectedAddress.province
            .trim()
            .toLowerCase();

        const city = selectedAddress.city
            .trim()
            .toLowerCase();

        const isMetroManila =
            province.includes("metro manila") ||
            province === "ncr" ||
            province.includes("national capital region");

        const shippingRegion = isMetroManila
            ? "Metro Manila"
            : "Provincial";

        const shippingFee =
            shippingRegion === "Metro Manila"
                ? 100
                : 180;

        const discountAmount = 0;

        const totalAmount =
            subtotal + shippingFee - discountAmount;

        const orderNumber =
            "YCN-" +
            Date.now().toString().slice(-8) +
            "-" +
            Math.floor(Math.random() * 1000)
                .toString()
                .padStart(3, "0");

        const initialPaymentStatus =
            payment_method === "COD"
                ? "unpaid"
                : "pending";

        const orderResult = await client.query(
            `INSERT INTO orders
            (
                order_number,
                user_id,
                subtotal,
                shipping_fee,
                discount_amount,
                total_amount,
                payment_method,
                payment_status,
                order_status,
                shipping_address,
                shipping_region
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
            [
                orderNumber,
                userId,
                subtotal,
                shippingFee,
                discountAmount,
                totalAmount,
                payment_method,
                initialPaymentStatus,
                "pending",
                shippingAddress,
                shippingRegion
            ]
        );

        const order = orderResult.rows[0];

        await addOrderStatusHistory(
            client,
            order.id,
            "pending",
            "Order placed",
            userId
        );

        for (const item of cartResult.rows) {
            const itemSubtotal =
                Number(item.price) * item.quantity;

            await client.query(
                `INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    product_name,
                    price,
                    quantity,
                    subtotal
                )
                VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    order.id,
                    item.product_id,
                    item.name,
                    item.price,
                    item.quantity,
                    itemSubtotal
                ]
            );
        }

        const cartId = cartResult.rows[0].cart_id;

        await client.query(
            "DELETE FROM cart_items WHERE cart_id = $1",
            [cartId]
        );

        await client.query("COMMIT");

        // ========================================
        // SEND ORDER CONFIRMATION EMAIL
        // ========================================

        try {
            sendEmail({
                to: customer.email,

                subject:
                    `YOCANA Order Confirmation - ${order.order_number}`,

                text:
                    `Hi ${customer.first_name}, your YOCANA order ` +
                    `${order.order_number} has been received. ` +
                    `Total: ₱${Number(order.total_amount).toFixed(2)}.`,

                html: orderConfirmationTemplate({
                    customer,
                    order,
                    items: cartResult.rows,
                }),
            }).catch((error) => {
                console.error(
                    "Order confirmation email error:",
                    error
                );
            });

        } catch (emailError) {
            console.error(
                "Order confirmation email template error:",
                emailError
            );
        }

        res.status(201).json({
            success: true,
            message: "Order created successfully",
            order: {
                id: order.id,
                order_number: order.order_number,
                subtotal: order.subtotal,
                shipping_fee: order.shipping_fee,
                discount_amount: order.discount_amount,
                total_amount: order.total_amount,
                payment_method: order.payment_method,
                payment_status: order.payment_status,
                order_status: order.order_status,
                shipping_address: order.shipping_address,
                shipping_region: order.shipping_region,
                created_at: order.created_at,
            },
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Create order error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    } finally {
        client.release();
    }
};

const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT
                id,
                order_number,
                subtotal,
                shipping_fee,
                discount_amount,
                total_amount,
                payment_method,
                payment_status,
                order_status,
                shipping_address,
                shipping_region,
                created_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            orders: result.rows,
        });

    } catch (error) {
        console.error("Get my orders error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


const getMyOrderById = async (req, res) => {
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

        const orderResult = await pool.query(
            `SELECT *
             FROM orders
             WHERE id = $1
             AND user_id = $2`,
            [parsedOrderId, userId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const itemsResult = await pool.query(
            `SELECT
                id,
                product_id,
                product_name,
                price,
                quantity,
                subtotal
             FROM order_items
             WHERE order_id = $1
             ORDER BY id`,
            [id]
        );

        res.json({
            success: true,
            order: {
                ...orderResult.rows[0],
                items: itemsResult.rows,
            },
        });

    } catch (error) {
        console.error("Get order details error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getAllOrders = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                o.id,
                o.order_number,
                o.total_amount,
                o.payment_method,
                o.payment_status,
                o.order_status,
                o.shipping_region,
                o.created_at,
                u.first_name,
                u.last_name,
                u.email
             FROM orders o
             JOIN users u ON u.id = o.user_id
             ORDER BY o.created_at DESC`
        );

        res.json({
            success: true,
            orders: result.rows,
        });

    } catch (error) {
        console.error("Get all orders error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getAdminOrderById = async (req, res) => {
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

        const orderResult = await pool.query(
            `SELECT
                o.*,
                u.first_name,
                u.last_name,
                u.email,
                u.phone
             FROM orders o
             JOIN users u ON u.id = o.user_id
             WHERE o.id = $1`,
            [parsedOrderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const itemsResult = await pool.query(
            `SELECT
                id,
                product_id,
                product_name,
                price,
                quantity,
                subtotal
             FROM order_items
             WHERE order_id = $1
             ORDER BY id`,
            [id]
        );

        res.json({
            success: true,
            order: {
                ...orderResult.rows[0],
                items: itemsResult.rows,
            },
        });

    } catch (error) {
        console.error("Get admin order details error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const updateOrderStatus = async (req, res) => {
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

        const {
            order_status,
            courier_name,
            tracking_number,
            tracking_url
        } = req.body || {};

        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT
                o.*,
                u.first_name,
                u.last_name,
                u.email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.id = $1
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

        if (
            ["cancelled", "returned"].includes(order.order_status)
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: `Order cannot be updated because it is already ${order.order_status}`,
            });
        }

        if (order.payment_status === "refunded") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Refunded orders cannot continue through the normal delivery flow",
            });
        }

        const allowedTransitions = {
            preparing: ["shipped"],
            shipped: ["delivered"],
        };

        const allowedNextStatuses =
            allowedTransitions[order.order_status] || [];

        if (!allowedNextStatuses.includes(order_status)) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: `Invalid order status transition: ${order.order_status} → ${order_status}`,
            });
        }

        if (order_status === "shipped") {
            const cancellationResult = await client.query(
                `SELECT id
                 FROM cancellation_requests
                 WHERE order_id = $1
                 AND status = 'pending'`,
                [id]
            );

            if (cancellationResult.rows.length > 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Order has a pending cancellation request and cannot be shipped yet",
                });
            }

            if (!courier_name || !tracking_number) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Courier and tracking number are required when shipping an order",
                });
            }

            if (
                order.payment_method !== "COD" &&
                order.payment_status !== "paid"
            ) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Online payment must be completed before the order can be shipped",
                });
            }
        }

        let shippedAt = order.shipped_at;
        let deliveredAt = order.delivered_at;

        if (order_status === "shipped") {
            shippedAt = new Date();
        }

        if (order_status === "delivered") {
            deliveredAt = new Date();
        }

        const updatedOrder = await client.query(
            `UPDATE orders
             SET order_status = $1,
                 courier_name = COALESCE($2, courier_name),
                 tracking_number = COALESCE($3, tracking_number),
                 tracking_url = COALESCE($4, tracking_url),
                 shipped_at = $5,
                 delivered_at = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [
                order_status,
                courier_name || null,
                tracking_number || null,
                tracking_url || null,
                shippedAt,
                deliveredAt,
                parsedOrderId
            ]
        );

        let historyNote = null;

        if (order_status === "shipped") {
            historyNote = courier_name
                ? `Order shipped via ${courier_name}`
                : "Order shipped";
        }

        if (order_status === "delivered") {
            historyNote = "Order delivered successfully";
        }

        await addOrderStatusHistory(
            client,
            order.id,
            order_status,
            historyNote,
            req.user.id
        );

        await client.query("COMMIT");

        // ========================================
        // SEND SHIPPED EMAIL
        // ========================================

        if (order_status === "shipped") {
            try {
                sendEmail({
                    to: order.email,

                    subject:
                        `Your YOCANA Order Has Been Shipped - ${order.order_number}`,

                    text:
                        `Hi ${order.first_name}, your YOCANA order ` +
                        `${order.order_number} has been shipped. ` +
                        `Courier: ${courier_name}. ` +
                        `Tracking Number: ${tracking_number}.`,

                    html: orderShippedTemplate({
                        customer: order,
                        order: {
                            ...order,
                            courier_name,
                            tracking_number,
                            tracking_url,
                        },
                    }),
                }).catch((error) => {
                    console.error(
                        "Order shipped email error:",
                        error
                    );
                });

            } catch (emailError) {
                console.error(
                    "Order shipped email template error:",
                    emailError
                );
            }
        }

        // ========================================
        // SEND DELIVERED EMAIL
        // ========================================

        if (order_status === "delivered") {
            try {
                sendEmail({
                    to: order.email,

                    subject:
                        `Your YOCANA Order Has Been Delivered - ${order.order_number}`,

                    text:
                        `Hi ${order.first_name}, your YOCANA order ` +
                        `${order.order_number} has been delivered successfully.`,

                    html: orderDeliveredTemplate({
                        customer: order,
                        order,
                    }),
                }).catch((error) => {
                    console.error(
                        "Order delivered email error:",
                        error
                    );
                });

            } catch (emailError) {
                console.error(
                    "Order delivered email template error:",
                    emailError
                );
            }
        }

        res.json({
            success: true,
            message: "Order status updated successfully",
            order: updatedOrder.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Update order status error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });

    } finally {
        client.release();
    }
};

const trackMyOrder = async (req, res) => {
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

        const orderResult = await pool.query(
            `SELECT
                id,
                order_number,
                order_status,
                payment_method,
                payment_status,
                courier_name,
                tracking_number,
                tracking_url,
                shipped_at,
                delivered_at,
                created_at,
                updated_at
             FROM orders
             WHERE id = $1
             AND user_id = $2`,
            [parsedOrderId, userId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        const order = orderResult.rows[0];

        const historyResult = await pool.query(
            `SELECT
                status,
                note,
                created_at
             FROM order_status_history
             WHERE order_id = $1
             ORDER BY created_at ASC`,
            [parsedOrderId]
        );

        res.json({
            success: true,
            tracking: {
                order_number: order.order_number,
                order_status: order.order_status,
                payment_method: order.payment_method,
                payment_status: order.payment_status,

                shipment: {
                    courier_name: order.courier_name,
                    tracking_number: order.tracking_number,
                    tracking_url: order.tracking_url,
                    shipped_at: order.shipped_at,
                    delivered_at: order.delivered_at,
                },

                timeline: historyResult.rows,

                ordered_at: order.created_at,
                last_updated: order.updated_at,
            },
        });

    } catch (error) {
        console.error("Track order error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const confirmCodOrder = async (req, res) => {
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

        await client.query("BEGIN");

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

        if (order.payment_method !== "COD") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "This endpoint is for COD orders only",
            });
        }

        if (order.order_status !== "pending") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Order has already been processed",
            });
        }

        // Prevent confirmation if cancellation is pending
        const cancellationResult = await client.query(
            `SELECT id
             FROM cancellation_requests
             WHERE order_id = $1
             AND status = 'pending'`,
            [id]
        );

        if (cancellationResult.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Order has a pending cancellation request",
            });
        }

        // Create COD payment record automatically if missing
        const paymentResult = await client.query(
            `SELECT id
             FROM payments
             WHERE order_id = $1`,
            [id]
        );

        if (paymentResult.rows.length === 0) {
            await client.query(
                `INSERT INTO payments
                (
                    order_id,
                    user_id,
                    payment_method,
                    amount,
                    status
                )
                VALUES ($1, $2, 'COD', $3, 'pending')`,
                [
                    order.id,
                    order.user_id,
                    order.total_amount
                ]
            );
        }

        await deductOrderStock(
            client,
            order.id,
            req.user.id
        );

        const updatedOrder = await client.query(
            `UPDATE orders
             SET order_status = 'preparing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        await addOrderStatusHistory(
            client,
            order.id,
            "preparing",
            "COD order confirmed and is being prepared",
            req.user.id
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "COD order confirmed and stock deducted successfully",
            order: updatedOrder.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Confirm COD order error:", error);

        res.status(400).json({
            success: false,
            message: error.message || "Failed to confirm COD order",
        });

    } finally {
        client.release();
    }
};

module.exports = {
    createOrder,
    getMyOrders,
    getMyOrderById,
    getAllOrders,
    getAdminOrderById,
    updateOrderStatus,
    trackMyOrder,
    confirmCodOrder,
};