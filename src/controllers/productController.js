const pool = require("../config/db");

const getProducts = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                name,
                slug,
                description,
                category,
                size_ml,
                price,
                image_url,
                is_active,
                created_at
             FROM products
             ORDER BY id ASC`
        );

        res.json({
            success: true,
            products: result.rows,
        });
    } catch (error) {
        console.error("Get products error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedProductId = Number(id);

        if (
            !Number.isInteger(parsedProductId) ||
            parsedProductId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }

        const result = await pool.query(
            `SELECT
                p.*,
                COALESCE(i.current_stock, 0) AS current_stock,
                CASE
                    WHEN COALESCE(i.current_stock, 0) > 0
                    THEN TRUE
                    ELSE FALSE
                END AS in_stock
             FROM products p
             LEFT JOIN inventory i
                ON i.product_id = p.id
             WHERE p.id = $1`,
            [parsedProductId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.json({
            success: true,
            product: result.rows[0],
        });

    } catch (error) {
        console.error("Get product error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const createProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            name,
            slug,
            description,
            category,
            size_ml,
            price,
            image_url
        } = req.body;
        const parsedPrice = Number(price);
        const parsedSizeMl = size_ml === undefined || size_ml === null || size_ml === ""
            ? 50
            : Number(size_ml);

        // ========================================
        // VALIDATION
        // ========================================
        if (
            !name?.trim() ||
            !slug?.trim() ||
            !category ||
            price === undefined ||
            price === null ||
            price === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, slug, category, and price are required",
            });
        }

        if (name.trim().length > 150) {
            return res.status(400).json({
                success: false,
                message: "Product name must not exceed 150 characters",
            });
        }

        if (slug.trim().length > 180) {
            return res.status(400).json({
                success: false,
                message: "Product slug must not exceed 180 characters",
            });
        }

        if (!["Men", "Women"].includes(category)) {
            return res.status(400).json({
                success: false,
                message: "Category must be Men or Women",
            });
        }

        if (!Number.isFinite(parsedPrice) ||
            parsedPrice <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Price must be a valid number greater than 0",
            });
        }

        if (!Number.isInteger(parsedSizeMl) ||
            parsedSizeMl <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Size must be a positive whole number",
            });
        }

        // ========================================
        // CHECK EXISTING SLUG
        // ========================================
        const existingProduct = await client.query(
            "SELECT id FROM products WHERE slug = $1",
            [slug]
        );

        if (existingProduct.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Product slug already exists",
            });
        }

        // ========================================
        // START TRANSACTION
        // ========================================
        await client.query("BEGIN");

        // ========================================
        // CREATE PRODUCT
        // ========================================
        const productResult = await client.query(
            `INSERT INTO products
            (
                name,
                slug,
                description,
                category,
                size_ml,
                price,
                image_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                name.trim(),
                slug.trim(),
                description || null,
                category,
                parsedSizeMl,
                parsedPrice,
                image_url || null
            ]
        );

        const product = productResult.rows[0];

        // ========================================
        // CREATE INVENTORY RECORD
        // ========================================
        const inventoryResult = await client.query(
            `INSERT INTO inventory
            (
                product_id,
                current_stock,
                low_stock_threshold
            )
            VALUES ($1, $2, $3)
            RETURNING *`,
            [
                product.id,
                0,
                10
            ]
        );

        // ========================================
        // COMMIT
        // ========================================
        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            product,
            inventory: inventoryResult.rows[0],
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Create product error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Product slug already exists",
            });
        }

        res.status(500).json({
            success: false,
            message: "Server error",
        });

    } finally {
        client.release();
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedProductId = Number(id);

        if (
            !Number.isInteger(parsedProductId) ||
            parsedProductId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }

        const {
            name,
            slug,
            description,
            category,
            size_ml,
            price,
            image_url
        } = req.body;
        const parsedPrice = Number(price);

        const parsedSizeMl =
            size_ml === undefined ||
                size_ml === null ||
                size_ml === ""
                ? 50
                : Number(size_ml);

        if (
            !name?.trim() ||
            !slug?.trim() ||
            !category ||
            price === undefined ||
            price === null ||
            price === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, slug, category, and price are required",
            });
        }

        if (name.trim().length > 150) {
            return res.status(400).json({
                success: false,
                message: "Product name must not exceed 150 characters",
            });
        }

        if (slug.trim().length > 180) {
            return res.status(400).json({
                success: false,
                message: "Product slug must not exceed 180 characters",
            });
        }

        if (!["Men", "Women"].includes(category)) {
            return res.status(400).json({
                success: false,
                message: "Category must be Men or Women",
            });
        }

        if (
            !Number.isFinite(parsedPrice) ||
            parsedPrice <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Price must be a valid number greater than 0",
            });
        }

        if (
            !Number.isInteger(parsedSizeMl) ||
            parsedSizeMl <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Size must be a positive whole number",
            });
        }

        const result = await pool.query(
            `UPDATE products
             SET name = $1,
                 slug = $2,
                 description = $3,
                 category = $4,
                 size_ml = $5,
                 price = $6,
                 image_url = $7,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *`,
            [
                name.trim(),
                slug.trim(),
                description || null,
                category,
                parsedSizeMl,
                parsedPrice,
                image_url || null,
                parsedProductId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.json({
            success: true,
            message: "Product updated successfully",
            product: result.rows[0],
        });

    } catch (error) {
        console.error("Update product error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Product slug already exists",
            });
        }

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const updateProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedProductId = Number(id);

        if (
            !Number.isInteger(parsedProductId) ||
            parsedProductId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID",
            });
        }
        const { is_active } = req.body;

        if (typeof is_active !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_active must be true or false",
            });
        }

        const result = await pool.query(
            `UPDATE products
             SET is_active = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [is_active, parsedProductId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.json({
            success: true,
            message: is_active
                ? "Product activated successfully"
                : "Product deactivated successfully",
            product: result.rows[0],
        });

    } catch (error) {
        console.error("Update product status error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateProductStatus,
};