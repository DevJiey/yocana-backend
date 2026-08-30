const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const register = async (req, res) => {
    try {
        const { first_name, last_name, email, password, phone } = req.body;

        if (!first_name || !last_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please fill in all required fields",
            });
        }

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered",
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users
            (first_name, last_name, email, password_hash, phone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, first_name, last_name, email, phone, role, created_at`,
            [first_name, last_name, email, passwordHash, phone || null]
        );

        res.status(201).json({
            success: true,
            message: "Account registered successfully",
            user: result.rows[0],
        });
    } catch (error) {
        console.error("Register error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive",
            });
        }

        if (!user.password_hash) {
            return res.status(400).json({
                success: false,
                message: "Please use Google Sign-In for this account",
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d",
            }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                first_name,
                last_name,
                email,
                phone,
                role,
                auth_provider,
                is_active,
                created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.json({
            success: true,
            user: result.rows[0],
        });
    } catch (error) {
        console.error("Get user error:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

const updateMe = async (req, res) => {
    try {
        const userId = req.user.id

        const {
            first_name,
            last_name,
            phone,
        } = req.body || {}

        if (!first_name?.trim() || !last_name?.trim()) {
            return res.status(400).json({
                success: false,
                message: "First name and last name are required",
            })
        }

        const result = await pool.query(
            `UPDATE users
             SET
                first_name = $1,
                last_name = $2,
                phone = $3,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING
                id,
                first_name,
                last_name,
                email,
                phone,
                role,
                auth_provider,
                is_active,
                created_at,
                updated_at`,
            [
                first_name.trim(),
                last_name.trim(),
                phone?.trim() || null,
                userId,
            ]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.json({
            success: true,
            message: "Profile updated successfully",
            user: result.rows[0],
        })
    } catch (error) {
        console.error("Update profile error:", error)

        res.status(500).json({
            success: false,
            message: "Server error",
        })
    }
}

module.exports = {
    register,
    login,
    getMe,
    updateMe,
};