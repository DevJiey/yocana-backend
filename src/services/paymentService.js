const {
    deductOrderStock,
} = require("./inventoryService");
const {
    addOrderStatusHistory,
} = require("./orderHistoryService");

const markOnlinePaymentAsPaid = async (
    client,
    payment,
    gatewayData = {}
) => {
    if (payment.status === "paid") {
        return payment;
    }

    const orderResult = await client.query(
        `SELECT *
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [payment.order_id]
    );

    if (orderResult.rows.length === 0) {
        throw new Error("Order not found");
    }

    const order = orderResult.rows[0];

    if (order.order_status !== "pending") {
        throw new Error(
            `Order cannot be paid from status: ${order.order_status}`
        );
    }

    await deductOrderStock(
        client,
        order.id,
        null
    );

    const updatedPayment = await client.query(
        `UPDATE payments
         SET status = 'paid',
             transaction_reference = $1,
             gateway = $2,
             gateway_payment_id = $3,
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [
            gatewayData.transaction_reference || null,
            gatewayData.gateway || null,
            gatewayData.gateway_payment_id || null,
            payment.id
        ]
    );

    await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
             order_status = 'preparing',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
    );

    await addOrderStatusHistory(
        client,
        order.id,
        "preparing",
        "Online payment confirmed and order is being prepared",
        null
    );

    return updatedPayment.rows[0];
};

module.exports = {
    markOnlinePaymentAsPaid,
};