const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

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

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body || {};

        if (!email?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, first_name, email, is_active
             FROM users
             WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        const genericResponse = {
            success: true,
            message:
                "If an account exists for this email, a password reset link has been sent.",
        };

        if (result.rows.length === 0) {
            return res.json(genericResponse);
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.json(genericResponse);
        }

        const resetToken = crypto.randomBytes(32).toString("hex");

        const hashedToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        const expiresAt = new Date(
            Date.now() + 15 * 60 * 1000
        );

        await pool.query(
            `UPDATE users
             SET password_reset_token = $1,
                 password_reset_expires = $2
             WHERE id = $3`,
            [hashedToken, expiresAt, user.id]
        );

        const frontendUrl =
            process.env.FRONTEND_URL ||
            "http://localhost:5173";

        const resetUrl =
            `${frontendUrl}/reset-password/${resetToken}`;

        const emailResult = await sendEmail({
            to: user.email,
            subject: "Reset your YOCANA password",
            text:
                `Hello ${user.first_name || "there"},\n\n` +
                `Reset your YOCANA password using this link:\n${resetUrl}\n\n` +
                `This link expires in 15 minutes.\n\n` +
                `If you did not request this, you can ignore this email.`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>YOCANA</h2>

                    <p>
                        Hello ${user.first_name || "there"},
                    </p>

                    <p>
                        We received a request to reset your YOCANA password.
                    </p>

                    <p>
                        <a href="${resetUrl}">
                            Reset Password
                        </a>
                    </p>

                    <p>
                        This link will expire in 15 minutes.
                    </p>

                    <p>
                        If you did not request a password reset,
                        you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (!emailResult.success) {
            console.error(
                "Forgot password email failed:",
                emailResult.error
            );

            await pool.query(
                `UPDATE users
                 SET password_reset_token = NULL,
                     password_reset_expires = NULL
                 WHERE id = $1`,
                [user.id]
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to send password reset email. Please try again later.",
            });
        }

        return res.json(genericResponse);
    } catch (error) {
        console.error("Forgot password error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body || {};

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Reset token is required",
            });
        }

        if (!password) {
            return res.status(400).json({
                success: false,
                message: "New password is required",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 8 characters long",
            });
        }

        const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const result = await pool.query(
            `SELECT id
             FROM users
             WHERE password_reset_token = $1
               AND password_reset_expires > CURRENT_TIMESTAMP
               AND is_active = true`,
            [hashedToken]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Password reset link is invalid or has expired",
            });
        }

        const userId = result.rows[0].id;

        const passwordHash = await bcrypt.hash(
            password,
            10
        );

        await pool.query(
            `UPDATE users
             SET password_hash = $1,
                 password_reset_token = NULL,
                 password_reset_expires = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [passwordHash, userId]
        );

        return res.json({
            success: true,
            message:
                "Password reset successfully. You can now sign in with your new password.",
        });
    } catch (error) {
        console.error("Reset password error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    register,
    login,
    getMe,
    updateMe,
    forgotPassword,
    resetPassword,
};