const pool = require("../config/db");

const getReportOverview = async (req, res) => {
    try {
        // ========================================
        // SALES
        // ========================================
        const salesResult = await pool.query(`
            SELECT
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COUNT(*) AS paid_orders
            FROM orders
            WHERE payment_status = 'paid'
        `);

        // ========================================
        // ORDER SUMMARY
        // ========================================
        const ordersResult = await pool.query(`
            SELECT
                COUNT(*) AS total_orders,

                COUNT(*) FILTER (
                    WHERE order_status = 'pending'
                ) AS pending_orders,

                COUNT(*) FILTER (
                    WHERE order_status = 'delivered'
                ) AS completed_orders,

                COUNT(*) FILTER (
                    WHERE order_status = 'cancelled'
                ) AS cancelled_orders,

                COUNT(*) FILTER (
                    WHERE order_status = 'returned'
                ) AS returned_orders
            FROM orders
        `);

        // ========================================
        // PRODUCTS SOLD
        // ========================================
        const productsSoldResult = await pool.query(`
            SELECT
                COALESCE(SUM(oi.quantity), 0) AS products_sold
            FROM order_items oi
            JOIN orders o
                ON o.id = oi.order_id
            WHERE o.order_status NOT IN (
                'cancelled',
                'returned'
            )
        `);

        // ========================================
        // INVENTORY SUMMARY
        // ========================================
        const inventoryResult = await pool.query(`
            SELECT
                COUNT(*) AS total_products,

                COALESCE(
                    SUM(current_stock),
                    0
                ) AS current_stock,

                COUNT(*) FILTER (
                    WHERE current_stock <= low_stock_threshold
                ) AS low_stock_products,

                COUNT(*) FILTER (
                    WHERE current_stock = 0
                ) AS out_of_stock_products
            FROM inventory
        `);

        // ========================================
        // CUSTOMERS
        // ========================================
        const customersResult = await pool.query(`
            SELECT COUNT(*) AS total_customers
            FROM users
            WHERE role = 'customer'
        `);

        res.json({
            success: true,

            report: {
                sales: {
                    total_sales: Number(
                        salesResult.rows[0].total_sales
                    ),
                    paid_orders: Number(
                        salesResult.rows[0].paid_orders
                    ),
                },

                orders: {
                    total_orders: Number(
                        ordersResult.rows[0].total_orders
                    ),
                    pending_orders: Number(
                        ordersResult.rows[0].pending_orders
                    ),
                    completed_orders: Number(
                        ordersResult.rows[0].completed_orders
                    ),
                    cancelled_orders: Number(
                        ordersResult.rows[0].cancelled_orders
                    ),
                    returned_orders: Number(
                        ordersResult.rows[0].returned_orders
                    ),
                },

                products: {
                    products_sold: Number(
                        productsSoldResult.rows[0].products_sold
                    ),
                },

                inventory: {
                    total_products: Number(
                        inventoryResult.rows[0].total_products
                    ),
                    current_stock: Number(
                        inventoryResult.rows[0].current_stock
                    ),
                    low_stock_products: Number(
                        inventoryResult.rows[0].low_stock_products
                    ),
                    out_of_stock_products: Number(
                        inventoryResult.rows[0].out_of_stock_products
                    ),
                },

                customers: {
                    total_customers: Number(
                        customersResult.rows[0].total_customers
                    ),
                },
            },
        });
    } catch (error) {
        console.error(
            "Get report overview error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getSalesReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const values = [];
        const conditions = [
            "o.payment_status = 'paid'"
        ];

        if (start_date) {
            values.push(start_date);

            conditions.push(
                `o.created_at >= $${values.length}::date`
            );
        }

        if (end_date) {
            values.push(end_date);

            conditions.push(
                `o.created_at < ($${values.length}::date + INTERVAL '1 day')`
            );
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;

        // ========================================
        // SALES SUMMARY
        // ========================================
        const summaryResult = await pool.query(
            `
            SELECT
                COALESCE(SUM(o.total_amount), 0) AS total_sales,
                COUNT(*) AS total_paid_orders,
                COALESCE(AVG(o.total_amount), 0) AS average_order_value
            FROM orders o
            ${whereClause}
            `,
            values
        );

        // ========================================
        // SALES BY DATE
        // ========================================
        const dailySalesResult = await pool.query(
            `
            SELECT
                DATE(o.created_at) AS sale_date,
                COUNT(*) AS total_orders,
                COALESCE(SUM(o.total_amount), 0) AS total_sales
            FROM orders o
            ${whereClause}
            GROUP BY DATE(o.created_at)
            ORDER BY sale_date ASC
            `,
            values
        );

        // ========================================
        // PRODUCT SALES
        // ========================================
        const productSalesResult = await pool.query(
            `
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.category,
                COALESCE(SUM(oi.quantity), 0) AS quantity_sold,
                COALESCE(SUM(oi.subtotal), 0) AS product_sales
            FROM order_items oi
            JOIN orders o
                ON o.id = oi.order_id
            JOIN products p
                ON p.id = oi.product_id
            ${whereClause}
            GROUP BY
                p.id,
                p.name,
                p.category
            ORDER BY product_sales DESC
            `,
            values
        );

        res.json({
            success: true,

            filters: {
                start_date: start_date || null,
                end_date: end_date || null,
            },

            sales: {
                total_sales: Number(
                    summaryResult.rows[0].total_sales
                ),

                total_paid_orders: Number(
                    summaryResult.rows[0].total_paid_orders
                ),

                average_order_value: Number(
                    summaryResult.rows[0].average_order_value
                ),

                by_date: dailySalesResult.rows.map((row) => ({
                    sale_date: row.sale_date,
                    total_orders: Number(row.total_orders),
                    total_sales: Number(row.total_sales),
                })),

                products: productSalesResult.rows.map((row) => ({
                    product_id: row.product_id,
                    product_name: row.product_name,
                    category: row.category,
                    quantity_sold: Number(row.quantity_sold),
                    product_sales: Number(row.product_sales),
                })),
            },
        });
    } catch (error) {
        console.error("Get sales report error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getOrdersReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const values = [];
        const conditions = [];

        if (start_date) {
            values.push(start_date);

            conditions.push(
                `o.created_at >= $${values.length}::date`
            );
        }

        if (end_date) {
            values.push(end_date);

            conditions.push(
                `o.created_at < ($${values.length}::date + INTERVAL '1 day')`
            );
        }

        const whereClause =
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

        // ========================================
        // ORDER SUMMARY
        // ========================================
        const summaryResult = await pool.query(
            `
            SELECT
                COUNT(*) AS total_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'pending'
                ) AS pending_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'preparing'
                ) AS preparing_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'shipped'
                ) AS shipped_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'delivered'
                ) AS completed_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'cancelled'
                ) AS cancelled_orders,

                COUNT(*) FILTER (
                    WHERE o.order_status = 'returned'
                ) AS returned_orders
            FROM orders o
            ${whereClause}
            `,
            values
        );

        // ========================================
        // ORDERS BY DATE
        // ========================================
        const ordersByDateResult = await pool.query(
            `
            SELECT
                DATE(o.created_at) AS order_date,
                COUNT(*) AS total_orders
            FROM orders o
            ${whereClause}
            GROUP BY DATE(o.created_at)
            ORDER BY order_date ASC
            `,
            values
        );

        res.json({
            success: true,

            filters: {
                start_date: start_date || null,
                end_date: end_date || null,
            },

            orders: {
                total_orders: Number(
                    summaryResult.rows[0].total_orders
                ),
                pending_orders: Number(
                    summaryResult.rows[0].pending_orders
                ),
                preparing_orders: Number(
                    summaryResult.rows[0].preparing_orders
                ),
                shipped_orders: Number(
                    summaryResult.rows[0].shipped_orders
                ),
                completed_orders: Number(
                    summaryResult.rows[0].completed_orders
                ),
                cancelled_orders: Number(
                    summaryResult.rows[0].cancelled_orders
                ),
                returned_orders: Number(
                    summaryResult.rows[0].returned_orders
                ),

                by_date: ordersByDateResult.rows.map((row) => ({
                    order_date: row.order_date,
                    total_orders: Number(row.total_orders),
                })),
            },
        });
    } catch (error) {
        console.error("Get orders report error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getInventoryReport = async (req, res) => {
    try {
        // ========================================
        // INVENTORY SUMMARY
        // ========================================
        const summaryResult = await pool.query(`
            SELECT
                COUNT(*) AS total_products,

                COALESCE(
                    SUM(i.current_stock),
                    0
                ) AS current_stock,

                COUNT(*) FILTER (
                    WHERE i.current_stock <= i.low_stock_threshold
                ) AS low_stock_products,

                COUNT(*) FILTER (
                    WHERE i.current_stock = 0
                ) AS out_of_stock_products
            FROM inventory i
        `);

        // ========================================
        // CURRENT INVENTORY
        // ========================================
        const inventoryResult = await pool.query(`
            SELECT
                i.id AS inventory_id,
                i.product_id,
                p.name AS product_name,
                p.category,
                i.current_stock,
                i.low_stock_threshold
            FROM inventory i
            JOIN products p
                ON p.id = i.product_id
            ORDER BY p.name ASC
        `);

        // ========================================
        // INVENTORY HISTORY
        // ========================================
        const historyResult = await pool.query(`
            SELECT *
            FROM inventory_transactions
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,

            inventory: {
                summary: {
                    total_products: Number(
                        summaryResult.rows[0].total_products
                    ),
                    current_stock: Number(
                        summaryResult.rows[0].current_stock
                    ),
                    low_stock_products: Number(
                        summaryResult.rows[0].low_stock_products
                    ),
                    out_of_stock_products: Number(
                        summaryResult.rows[0].out_of_stock_products
                    ),
                },

                products: inventoryResult.rows.map((row) => ({
                    ...row,
                    current_stock: Number(row.current_stock),
                    low_stock_threshold: Number(
                        row.low_stock_threshold
                    ),
                })),

                history: historyResult.rows,
            },
        });
    } catch (error) {
        console.error(
            "Get inventory report error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    getReportOverview,
    getSalesReport,
    getOrdersReport,
    getInventoryReport,
};