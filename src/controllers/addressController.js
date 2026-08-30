const pool = require("../config/db")

const getMyAddresses = async (req, res) => {
    try {
        const userId = req.user.id

        const result = await pool.query(
            `SELECT
                id,
                user_id,
                label,
                recipient_name,
                phone,
                address_line,
                barangay,
                city,
                province,
                postal_code,
                is_default,
                created_at,
                updated_at
             FROM customer_addresses
             WHERE user_id = $1
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        )

        res.json({
            success: true,
            addresses: result.rows,
        })
    } catch (error) {
        console.error("Get addresses error:", error)

        res.status(500).json({
            success: false,
            message: "Failed to load addresses",
        })
    }
}

const createAddress = async (req, res) => {
    const client = await pool.connect()

    try {
        const userId = req.user.id

        const {
            label,
            recipient_name,
            phone,
            address_line,
            barangay,
            city,
            province,
            postal_code,
            is_default,
        } = req.body || {}

        if (
            !recipient_name?.trim() ||
            !phone?.trim() ||
            !address_line?.trim() ||
            !city?.trim() ||
            !province?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Recipient name, phone, address, city, and province are required",
            })
        }

        await client.query("BEGIN")

        const countResult = await client.query(
            `SELECT COUNT(*)::int AS count
             FROM customer_addresses
             WHERE user_id = $1`,
            [userId]
        )

        const isFirstAddress =
            countResult.rows[0].count === 0

        const shouldBeDefault =
            isFirstAddress || is_default === true

        if (shouldBeDefault) {
            await client.query(
                `UPDATE customer_addresses
                 SET is_default = FALSE,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [userId]
            )
        }

        const result = await client.query(
            `INSERT INTO customer_addresses
            (
                user_id,
                label,
                recipient_name,
                phone,
                address_line,
                barangay,
                city,
                province,
                postal_code,
                is_default
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *`,
            [
                userId,
                label?.trim() || "Home",
                recipient_name.trim(),
                phone.trim(),
                address_line.trim(),
                barangay?.trim() || null,
                city.trim(),
                province.trim(),
                postal_code?.trim() || null,
                shouldBeDefault,
            ]
        )

        await client.query("COMMIT")

        res.status(201).json({
            success: true,
            message: "Address added successfully",
            address: result.rows[0],
        })
    } catch (error) {
        await client.query("ROLLBACK")

        console.error("Create address error:", error)

        res.status(500).json({
            success: false,
            message: "Failed to add address",
        })
    } finally {
        client.release()
    }
}

const updateAddress = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params
        const parsedAddressId = Number(id)

        if (
            !Number.isInteger(parsedAddressId) ||
            parsedAddressId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID",
            })
        }

        const {
            label,
            recipient_name,
            phone,
            address_line,
            barangay,
            city,
            province,
            postal_code,
        } = req.body || {}

        if (
            !recipient_name?.trim() ||
            !phone?.trim() ||
            !address_line?.trim() ||
            !city?.trim() ||
            !province?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Recipient name, phone, address, city, and province are required",
            })
        }

        const result = await pool.query(
            `UPDATE customer_addresses
             SET
                label = $1,
                recipient_name = $2,
                phone = $3,
                address_line = $4,
                barangay = $5,
                city = $6,
                province = $7,
                postal_code = $8,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $9
             AND user_id = $10
             RETURNING *`,
            [
                label?.trim() || "Home",
                recipient_name.trim(),
                phone.trim(),
                address_line.trim(),
                barangay?.trim() || null,
                city.trim(),
                province.trim(),
                postal_code?.trim() || null,
                parsedAddressId,
                userId,
            ]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Address not found",
            })
        }

        res.json({
            success: true,
            message: "Address updated successfully",
            address: result.rows[0],
        })
    } catch (error) {
        console.error("Update address error:", error)

        res.status(500).json({
            success: false,
            message: "Failed to update address",
        })
    }
}

const setDefaultAddress = async (req, res) => {
    const client = await pool.connect()

    try {
        const userId = req.user.id
        const { id } = req.params
        const parsedAddressId = Number(id)

        if (
            !Number.isInteger(parsedAddressId) ||
            parsedAddressId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID",
            })
        }

        await client.query("BEGIN")

        const addressResult = await client.query(
            `SELECT id
             FROM customer_addresses
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [parsedAddressId, userId]
        )

        if (addressResult.rows.length === 0) {
            await client.query("ROLLBACK")

            return res.status(404).json({
                success: false,
                message: "Address not found",
            })
        }

        await client.query(
            `UPDATE customer_addresses
             SET is_default = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1`,
            [userId]
        )

        const result = await client.query(
            `UPDATE customer_addresses
             SET is_default = TRUE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             AND user_id = $2
             RETURNING *`,
            [id, userId]
        )

        await client.query("COMMIT")

        res.json({
            success: true,
            message: "Default address updated successfully",
            address: result.rows[0],
        })
    } catch (error) {
        await client.query("ROLLBACK")

        console.error("Set default address error:", error)

        res.status(500).json({
            success: false,
            message: "Failed to update default address",
        })
    } finally {
        client.release()
    }
}

const deleteAddress = async (req, res) => {
    const client = await pool.connect()

    try {
        const userId = req.user.id
        const { id } = req.params
        const parsedAddressId = Number(id)

        if (
            !Number.isInteger(parsedAddressId) ||
            parsedAddressId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID",
            })
        }

        await client.query("BEGIN")

        const addressResult = await client.query(
            `SELECT id, is_default
             FROM customer_addresses
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [parsedAddressId, userId]
        )

        if (addressResult.rows.length === 0) {
            await client.query("ROLLBACK")

            return res.status(404).json({
                success: false,
                message: "Address not found",
            })
        }

        const wasDefault = addressResult.rows[0].is_default

        await client.query(
            `DELETE FROM customer_addresses
             WHERE id = $1
             AND user_id = $2`,
            [id, userId]
        )

        if (wasDefault) {
            const nextAddress = await client.query(
                `SELECT id
                 FROM customer_addresses
                 WHERE user_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId]
            )

            if (nextAddress.rows.length > 0) {
                await client.query(
                    `UPDATE customer_addresses
                     SET is_default = TRUE,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1
                     AND user_id = $2`,
                    [nextAddress.rows[0].id, userId]
                )
            }
        }

        await client.query("COMMIT")

        res.json({
            success: true,
            message: "Address deleted successfully",
        })
    } catch (error) {
        await client.query("ROLLBACK")

        console.error("Delete address error:", error)

        res.status(500).json({
            success: false,
            message: "Failed to delete address",
        })
    } finally {
        client.release()
    }
}

module.exports = {
    getMyAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
}