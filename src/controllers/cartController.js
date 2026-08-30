const pool = require("../config/db");


// ========================================
// CUSTOMER - ADD TO CART
// ========================================

const addToCart = async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = req.user.id;

        const {
            product_id,
            quantity,
        } = req.body || {};

        const qty = Number(quantity);

        if (
            !product_id ||
            !Number.isInteger(qty) ||
            qty <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Valid product_id and quantity are required",
            });
        }

        await client.query("BEGIN");

        const productResult = await client.query(
            `SELECT
                p.id,
                p.name,
                p.is_active,
                i.current_stock
             FROM products p
             JOIN inventory i
                ON i.product_id = p.id
             WHERE p.id = $1
             FOR UPDATE`,
            [product_id]
        );

        if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const product = productResult.rows[0];

        if (!product.is_active) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Product is currently unavailable",
            });
        }

        if (product.current_stock <= 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Product is out of stock",
            });
        }

        let cartResult = await client.query(
            `SELECT id
             FROM carts
             WHERE user_id = $1`,
            [userId]
        );

        let cartId;

        if (cartResult.rows.length === 0) {
            const newCart = await client.query(
                `INSERT INTO carts
                (
                    user_id
                )
                VALUES ($1)
                RETURNING id`,
                [userId]
            );

            cartId = newCart.rows[0].id;
        } else {
            cartId = cartResult.rows[0].id;
        }

        const existingItem = await client.query(
            `SELECT
                id,
                quantity
             FROM cart_items
             WHERE cart_id = $1
             AND product_id = $2`,
            [
                cartId,
                product_id
            ]
        );

        let finalQuantity = qty;

        if (existingItem.rows.length > 0) {
            finalQuantity =
                Number(existingItem.rows[0].quantity) +
                qty;
        }

        if (finalQuantity > product.current_stock) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Requested quantity exceeds available stock",
                available_stock:
                    product.current_stock,
            });
        }

        let result;

        if (existingItem.rows.length > 0) {
            result = await client.query(
                `UPDATE cart_items
                 SET quantity = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [
                    finalQuantity,
                    existingItem.rows[0].id
                ]
            );
        } else {
            result = await client.query(
                `INSERT INTO cart_items
                (
                    cart_id,
                    product_id,
                    quantity
                )
                VALUES ($1, $2, $3)
                RETURNING *`,
                [
                    cartId,
                    product_id,
                    qty
                ]
            );
        }

        await client.query(
            `UPDATE carts
             SET updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [cartId]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Product added to cart",
            cart_item: result.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Add to cart error:",
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
// CUSTOMER - VIEW CART
// ========================================

const getCart = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT
                ci.id AS cart_item_id,
                p.id AS product_id,
                p.name,
                p.category,
                p.size_ml,
                p.price,
                p.image_url,
                p.is_active,
                ci.quantity,
                i.current_stock,
                (p.price * ci.quantity)
                    AS item_subtotal
             FROM carts c
             JOIN cart_items ci
                ON ci.cart_id = c.id
             JOIN products p
                ON p.id = ci.product_id
             JOIN inventory i
                ON i.product_id = p.id
             WHERE c.user_id = $1
             ORDER BY ci.created_at ASC`,
            [userId]
        );

        const items = result.rows;

        const subtotal = items.reduce(
            (total, item) =>
                total +
                Number(item.item_subtotal),
            0
        );

        const totalItems = items.reduce(
            (total, item) =>
                total + Number(item.quantity),
            0
        );

        res.json({
            success: true,
            cart: {
                items,
                total_items: totalItems,
                subtotal: subtotal.toFixed(2),
            },
        });

    } catch (error) {
        console.error(
            "Get cart error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// CUSTOMER - UPDATE CART QUANTITY
// ========================================

const updateCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const {
            quantity,
        } = req.body || {};

        const qty = Number(quantity);

        if (
            !Number.isInteger(qty) ||
            qty <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Quantity must be a whole number greater than 0",
            });
        }

        const itemResult = await pool.query(
            `SELECT
                ci.id,
                ci.product_id,
                c.user_id,
                p.is_active,
                i.current_stock
             FROM cart_items ci
             JOIN carts c
                ON c.id = ci.cart_id
             JOIN products p
                ON p.id = ci.product_id
             JOIN inventory i
                ON i.product_id = ci.product_id
             WHERE ci.id = $1
             AND c.user_id = $2`,
            [
                id,
                userId
            ]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found",
            });
        }

        const item = itemResult.rows[0];

        if (!item.is_active) {
            return res.status(400).json({
                success: false,
                message:
                    "Product is currently unavailable",
            });
        }

        if (qty > item.current_stock) {
            return res.status(400).json({
                success: false,
                message:
                    "Requested quantity exceeds available stock",
                available_stock:
                    item.current_stock,
            });
        }

        const result = await pool.query(
            `UPDATE cart_items
             SET quantity = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [
                qty,
                id
            ]
        );

        res.json({
            success: true,
            message:
                "Cart quantity updated",
            cart_item: result.rows[0],
        });

    } catch (error) {
        console.error(
            "Update cart error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


// ========================================
// CUSTOMER - REMOVE CART ITEM
// ========================================

const removeCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const result = await pool.query(
            `DELETE FROM cart_items
             WHERE id = $1
             AND cart_id IN (
                 SELECT id
                 FROM carts
                 WHERE user_id = $2
             )
             RETURNING id`,
            [
                id,
                userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Cart item not found",
            });
        }

        res.json({
            success: true,
            message:
                "Product removed from cart",
        });

    } catch (error) {
        console.error(
            "Remove cart item error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


module.exports = {
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
};