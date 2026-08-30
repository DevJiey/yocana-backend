const pool = require("../config/db");

// ========================================
// GET ALL CUSTOMERS
// ========================================
const getAllCustomers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                first_name,
                last_name,
                email,
                role,
                created_at
             FROM users
             WHERE role = 'customer'
             ORDER BY created_at DESC`
        );

        res.json({
            success: true,
            customers: result.rows,
        });

    } catch (error) {
        console.error(
            "Get all customers error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// GET CUSTOMER BY ID
// ========================================
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;

        const customerResult = await pool.query(
            `SELECT
                id,
                first_name,
                last_name,
                email,
                role,
                created_at
             FROM users
             WHERE id = $1
             AND role = 'customer'`,
            [id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found",
            });
        }

        const ordersResult = await pool.query(
            `SELECT
                id,
                order_number,
                total_amount,
                payment_method,
                payment_status,
                order_status,
                created_at
             FROM orders
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [id]
        );

        res.json({
            success: true,
            customer: {
                ...customerResult.rows[0],
                orders: ordersResult.rows,
            },
        });

    } catch (error) {
        console.error(
            "Get customer by ID error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


module.exports = {
    getAllCustomers,
    getCustomerById,
};