const pool = require("../config/db");

const getAdminDashboard = async (req, res) => {
    try {
        // ========================================
        // TOTAL SALES
        // ========================================
        const totalSalesResult = await pool.query(
            `SELECT
                COALESCE(SUM(total_amount), 0) AS total_sales
             FROM orders
             WHERE payment_status = 'paid'`
        );

        // ========================================
        // TOTAL ORDERS
        // ========================================
        const totalOrdersResult = await pool.query(
            `SELECT COUNT(*) AS total_orders
             FROM orders`
        );

        // ========================================
        // PENDING ORDERS
        // ========================================
        const pendingOrdersResult = await pool.query(
            `SELECT COUNT(*) AS pending_orders
             FROM orders
             WHERE order_status = 'pending'`
        );

        // ========================================
        // PRODUCTS SOLD
        // ========================================
        const productsSoldResult = await pool.query(
            `SELECT
                COALESCE(SUM(oi.quantity), 0) AS products_sold
             FROM order_items oi
             JOIN orders o
                ON o.id = oi.order_id
             WHERE o.order_status NOT IN (
                'cancelled',
                'returned'
             )`
        );

        // ========================================
        // CURRENT INVENTORY
        // ========================================
        const inventoryResult = await pool.query(
            `SELECT
                COALESCE(SUM(current_stock), 0)
                AS current_inventory
             FROM inventory`
        );

        // ========================================
        // LOW STOCK PRODUCTS
        // ========================================
        const lowStockResult = await pool.query(
            `SELECT COUNT(*) AS low_stock_products
             FROM inventory
             WHERE current_stock <= low_stock_threshold`
        );

        // ========================================
        // TOTAL CUSTOMERS
        // ========================================
        const totalCustomersResult = await pool.query(
            `SELECT COUNT(*) AS total_customers
             FROM users
             WHERE role = 'customer'`
        );

        // ========================================
        // RECENT ORDERS
        // ========================================
        const recentOrdersResult = await pool.query(
            `SELECT
                o.id,
                o.order_number,
                o.total_amount,
                o.payment_method,
                o.payment_status,
                o.order_status,
                o.created_at,
                u.first_name,
                u.last_name,
                u.email
             FROM orders o
             JOIN users u
                ON u.id = o.user_id
             ORDER BY o.created_at DESC
             LIMIT 5`
        );

        res.json({
            success: true,

            dashboard: {
                total_sales:
                    Number(
                        totalSalesResult.rows[0]
                            .total_sales
                    ),

                total_orders:
                    Number(
                        totalOrdersResult.rows[0]
                            .total_orders
                    ),

                pending_orders:
                    Number(
                        pendingOrdersResult.rows[0]
                            .pending_orders
                    ),

                products_sold:
                    Number(
                        productsSoldResult.rows[0]
                            .products_sold
                    ),

                current_inventory:
                    Number(
                        inventoryResult.rows[0]
                            .current_inventory
                    ),

                low_stock_products:
                    Number(
                        lowStockResult.rows[0]
                            .low_stock_products
                    ),

                total_customers:
                    Number(
                        totalCustomersResult.rows[0]
                            .total_customers
                    ),

                recent_orders:
                    recentOrdersResult.rows,
            },
        });

    } catch (error) {
        console.error(
            "Get admin dashboard error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    getAdminDashboard,
};