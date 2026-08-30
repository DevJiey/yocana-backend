const pool = require("../config/db");

const getInventory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                i.id,
                p.id AS product_id,
                p.name,
                p.category,
                i.current_stock,
                i.low_stock_threshold,
                CASE
                    WHEN i.current_stock <= i.low_stock_threshold
                    THEN TRUE
                    ELSE FALSE
                END AS is_low_stock,
                i.updated_at
             FROM inventory i
             JOIN products p ON p.id = i.product_id
             ORDER BY p.id`
        );

        res.json({
            success: true,
            inventory: result.rows,
        });
    } catch (error) {
        console.error("Get inventory error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const stockIn = async (req, res) => {
    const client = await pool.connect();

    try {
        const { product_id, quantity, reason } = req.body;
        const parsedProductId = Number(product_id);
        const parsedQuantity = Number(quantity)

        if (
            !Number.isInteger(parsedProductId) ||
            parsedProductId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }

        if (
            !Number.isInteger(parsedQuantity) ||
            parsedQuantity <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive whole number",
            })
        }

        await client.query("BEGIN");

        const inventoryResult = await client.query(
            `SELECT current_stock
             FROM inventory
             WHERE product_id = $1
             FOR UPDATE`,
            [parsedProductId]
        );

        if (inventoryResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Inventory record not found",
            });
        }

        const previousStock = inventoryResult.rows[0].current_stock;
        const newStock = previousStock + parsedQuantity;

        await client.query(
            `UPDATE inventory
             SET current_stock = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $2`,
            [newStock, parsedProductId]
        );

        await client.query(
            `INSERT INTO inventory_transactions
            (
                product_id,
                transaction_type,
                parsedQuantity,
                previous_stock,
                new_stock,
                reason,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                parsedProductId,
                "STOCK_IN",
                quantity,
                previousStock,
                newStock,
                reason || "Manual stock in",
                req.user.id
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Stock added successfully",
            inventory: {
                product_id,
                previous_stock: previousStock,
                added_quantity: parsedQuantity,
                current_stock: newStock,
            },
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Stock in error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    } finally {
        client.release();
    }
};

const stockOut = async (req, res) => {
    const client = await pool.connect();

    try {
        const { product_id, quantity, reason } = req.body;
        const parsedQuantity = Number(quantity);

        if (
            !Number.isInteger(parsedProductId) ||
            parsedProductId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }

        if (
            !Number.isInteger(parsedQuantity) ||
            parsedQuantity <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive whole number",
            })
        }

        await client.query("BEGIN");

        const inventoryResult = await client.query(
            `SELECT current_stock, low_stock_threshold
             FROM inventory
             WHERE product_id = $1
             FOR UPDATE`,
            [parsedProductId]
        );

        if (inventoryResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Inventory record not found",
            });
        }

        const previousStock = inventoryResult.rows[0].current_stock;
        const threshold = inventoryResult.rows[0].low_stock_threshold;
        const requestedQuantity = parsedQuantity;

        if (requestedQuantity > previousStock) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Insufficient stock",
            });
        }

        const newStock = previousStock - requestedQuantity;

        await client.query(
            `UPDATE inventory
             SET current_stock = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $2`,
            [newStock, parsedProductId]
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
                parsedProductId,
                "STOCK_OUT",
                requestedQuantity,
                previousStock,
                newStock,
                reason || "Manual stock out",
                req.user.id
            ]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Stock removed successfully",
            inventory: {
                product_id,
                previous_stock: previousStock,
                removed_quantity: requestedQuantity,
                current_stock: newStock,
                is_low_stock: newStock <= threshold,
            },
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Stock out error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    } finally {
        client.release();
    }
};

const getInventoryHistory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                it.id,
                p.name AS product_name,
                it.transaction_type,
                it.quantity,
                it.previous_stock,
                it.new_stock,
                it.reason,
                u.first_name,
                u.last_name,
                it.created_at
             FROM inventory_transactions it
             JOIN products p ON p.id = it.product_id
             LEFT JOIN users u ON u.id = it.created_by
             ORDER BY it.created_at DESC`
        );

        res.json({
            success: true,
            history: result.rows,
        });
    } catch (error) {
        console.error("Inventory history error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getLowStockProducts = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                p.id AS product_id,
                p.name,
                p.category,
                i.current_stock,
                i.low_stock_threshold
             FROM inventory i
             JOIN products p ON p.id = i.product_id
             WHERE i.current_stock <= i.low_stock_threshold
             ORDER BY i.current_stock ASC`
        );

        res.json({
            success: true,
            low_stock_products: result.rows,
        });
    } catch (error) {
        console.error("Low stock error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    getInventory,
    stockIn,
    stockOut,
    getInventoryHistory,
    getLowStockProducts,
};