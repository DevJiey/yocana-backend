const {
    sendEmail,
} = require("../services/emailService");

const sendTestEmail = async (req, res) => {
    try {
        const { email } = req.body || {};

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        const result = await sendEmail({
            to: email,
            subject: "YOCANA Email Test",
            text: "YOCANA email notification system is working.",
            html: `
                <h2>YOCANA</h2>
                <p>Email notification system is working successfully.</p>
            `,
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.skipped
                    ? "SMTP email configuration is missing"
                    : "Failed to send test email",
                error: result.error || null,
            });
        }

        res.json({
            success: true,
            message: "Test email sent successfully",
        });

    } catch (error) {
        console.error(
            "Test email error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    sendTestEmail,
};