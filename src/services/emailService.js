const nodemailer = require("nodemailer");
const dns = require("node:dns");

dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendEmail = async ({
    to,
    subject,
    text,
    html
}) => {
    try {
        if (
            !process.env.EMAIL_HOST ||
            !process.env.EMAIL_PORT ||
            !process.env.EMAIL_USER ||
            !process.env.EMAIL_PASS
        ) {
            console.log(
                "Email skipped: SMTP credentials are not configured."
            );

            return {
                success: false,
                skipped: true,
            };
        }

        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            text,
            html,
        });

        console.log(
            "Email sent:",
            info.messageId
        );

        return {
            success: true,
            messageId: info.messageId,
        };

    } catch (error) {
        console.error(
            "Send email error:",
            error.message
        );

        return {
            success: false,
            error: error.message,
        };
    }
};

module.exports = {
    sendEmail,
};