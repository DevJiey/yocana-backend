const deductOrderStock = async (
    client,
    orderId,
    adminUserId = null
) => {
    const itemsResult = await client.query(
        `SELECT
            oi.product_id,
            oi.product_name,
            oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
    );

    if (itemsResult.rows.length === 0) {
        throw new Error("Order has no items");
    }

    for (const item of itemsResult.rows) {
        const inventoryResult = await client.query(
            `SELECT current_stock
             FROM inventory
             WHERE product_id = $1
             FOR UPDATE`,
            [item.product_id]
        );

        if (inventoryResult.rows.length === 0) {
            throw new Error(
                `Inventory record not found for ${item.product_name}`
            );
        }

        const previousStock =
            inventoryResult.rows[0].current_stock;

        if (item.quantity > previousStock) {
            throw new Error(
                `Insufficient stock for ${item.product_name}`
            );
        }

        const newStock =
            previousStock - item.quantity;

        await client.query(
            `UPDATE inventory
             SET current_stock = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $2`,
            [
                newStock,
                item.product_id
            ]
        );

        await client.query(
            `INSERT INTO inventory_transactions
            (
                product_id,
                transaction_type,
                quantity,
                previous_stock,
                new_stock,
                reason,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                item.product_id,
                "ORDER",
                item.quantity,
                previousStock,
                newStock,
                `Stock deducted for order #${orderId}`,
                adminUserId
            ]
        );
    }
};


const restoreOrderStock = async (
    client,
    orderId,
    adminUserId = null,
    reason = "cancelled"
) => {
    const itemsResult = await client.query(
        `SELECT
            oi.product_id,
            oi.product_name,
            oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
    );

    if (itemsResult.rows.length === 0) {
        throw new Error("Order has no items");
    }

    for (const item of itemsResult.rows) {
        const inventoryResult = await client.query(
            `SELECT current_stock
             FROM inventory
             WHERE product_id = $1
             FOR UPDATE`,
            [item.product_id]
        );

        if (inventoryResult.rows.length === 0) {
            throw new Error(
                `Inventory record not found for ${item.product_name}`
            );
        }

        const previousStock =
            inventoryResult.rows[0].current_stock;

        const newStock =
            previousStock + item.quantity;

        await client.query(
            `UPDATE inventory
             SET current_stock = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $2`,
            [
                newStock,
                item.product_id
            ]
        );

        let restoreReason;

        if (reason === "returned") {
            restoreReason =
                `Stock restored from returned order #${orderId}`;
        } else {
            restoreReason =
                `Stock restored from cancelled order #${orderId}`;
        }

        await client.query(
            `INSERT INTO inventory_transactions
            (
                product_id,
                transaction_type,
                quantity,
                previous_stock,
                new_stock,
                reason,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                item.product_id,
                "RESTORE",
                item.quantity,
                previousStock,
                newStock,
                restoreReason,
                adminUserId
            ]
        );
    }
};


module.exports = {
    deductOrderStock,
    restoreOrderStock,
};