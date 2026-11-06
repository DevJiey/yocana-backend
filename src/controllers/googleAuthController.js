const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Google provides a signed ID token. Never trust an email or role from the browser.
const googleClient = new OAuth2Client();

const googleLogin = async (req, res) => {
    const credential = req.body?.credential;

    if (typeof credential !== "string" || !credential || credential.length > 8192) {
        return res.status(400).json({
            success: false,
            message: "Google credential is required",
        });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
        console.error("GOOGLE_CLIENT_ID is not configured");
        return res.status(503).json({
            success: false,
            message: "Google sign-in is not configured",
        });
    }

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired Google sign-in",
        });
    }

    const googleId = payload?.sub;
    const email = typeof payload?.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";

    if (
        !googleId || googleId.length > 255 ||
        !email || email.length > 255 ||
        payload?.email_verified !== true
    ) {
        return res.status(401).json({
            success: false,
            message: "A verified Google email is required",
        });
    }

    try {
        // Identify returning Google users by immutable Google subject, not email.
        const googleUser = await pool.query(
            "SELECT id, first_name, last_name, email, phone, role, is_active, token_version FROM users WHERE google_id = $1",
            [googleId]
        );
        let user = googleUser.rows[0];

        if (!user) {
            // Do not silently link an existing password or admin account by email.
            // A separate authenticated account-linking flow can be added later.
            const emailUser = await pool.query(
                "SELECT id FROM users WHERE LOWER(email) = $1",
                [email]
            );
            if (emailUser.rows.length) {
                return res.status(409).json({
                    success: false,
                    message: "This email already has a YOCANA account. Sign in with your password first.",
                });
            }

            const firstName = String(payload.given_name || "Google").trim().slice(0, 100) || "Google";
            const lastName = String(payload.family_name || "User").trim().slice(0, 100) || "User";
            const created = await pool.query(
                `INSERT INTO users (first_name, last_name, email, password_hash, auth_provider, google_id, role)
         VALUES ($1, $2, $3, NULL, 'google', $4, 'customer')
         RETURNING id, first_name, last_name, email, phone, role, is_active, token_version`,
                [firstName, lastName, email, googleId]
            );
            user = created.rows[0];
        }

        if (user.role !== "customer") {
            return res.status(403).json({
                success: false,
                message: "Google customer sign-in is not available for this account",
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive",
            });
        }

        // Same YOCANA session format as password login.
        const token = jwt.sign(
            { id: user.id, role: user.role, token_version: user.token_version },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.json({
            success: true,
            message: "Google sign-in successful",
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
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "An account already exists. Please sign in using your existing account.",
            });
        }
        console.error("Google login error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = { googleLogin };
