
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../config/db");

const googleClient = new OAuth2Client();

const linkGoogle = async (req, res) => {
  const password = req.body?.password;
  const credential = req.body?.credential;

  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 128
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter your current YOCANA password",
    });
  }

  if (
    typeof credential !== "string" ||
    !credential ||
    credential.length > 8192
  ) {
    return res.status(400).json({
      success: false,
      message: "A Google sign-in credential is required",
    });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({
      success: false,
      message: "Google account linking is not configured",
    });
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired Google sign-in",
    });
  }

  const googleId = payload?.sub;

  const googleEmail =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

  if (
    typeof googleId !== "string" ||
    !googleId ||
    googleId.length > 255 ||
    !googleEmail ||
    googleEmail.length > 255 ||
    payload?.email_verified !== true
  ) {
    return res.status(401).json({
      success: false,
      message: "A verified Google account is required",
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT
        id, email, password_hash, role,
        is_active, google_id
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.is_active ||
      user.role !== "customer"
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Only active customers can connect Google",
      });
    }

    if (!user.password_hash) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "This account has no password to verify",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      await client.query("ROLLBACK");

      return res.status(401).json({
        success: false,
        message: "Incorrect YOCANA password",
      });
    }

    if (
      user.email.trim().toLowerCase() !== googleEmail
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "Use the Google account with the same YOCANA email",
      });
    }

    if (user.google_id) {
      await client.query("ROLLBACK");

      const alreadyLinked = user.google_id === googleId;

      return res.status(alreadyLinked ? 200 : 409).json({
        success: alreadyLinked,
        message: alreadyLinked
          ? "Google account is already connected"
          : "Another Google account is already connected",
      });
    }

    const used = await client.query(
      `SELECT id FROM users
       WHERE google_id = $1 AND id <> $2
       LIMIT 1`,
      [googleId, user.id]
    );

    if (used.rows.length) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "Google account is connected to another YOCANA account",
      });
    }

    await client.query(
      `UPDATE users
       SET google_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND google_id IS NULL`,
      [googleId, user.id]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Google account connected successfully",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Connection or transaction already closed.
      }
    }

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Google account is already connected",
      });
    }

    console.error("Google linking error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  } finally {
    client?.release();
  }
};

module.exports = { linkGoogle };
