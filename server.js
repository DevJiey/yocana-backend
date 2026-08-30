require("dotenv").config();
const requiredEnv = ["JWT_SECRET"];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`Missing required environment variable: ${key}`);
        process.exit(1);
    }
}
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const pool = require("./src/config/db");
const app = express();
const authRoutes = require("./src/routes/authRoutes");
const productRoutes = require("./src/routes/productRoutes");
const inventoryRoutes = require("./src/routes/inventoryRoutes");
const cartRoutes = require("./src/routes/cartRoutes");
const orderRoutes = require("./src/routes/orderRoutes");
const refundRoutes = require("./src/routes/refundRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const emailRoutes = require("./src/routes/emailRoutes");
const adminDashboardRoutes = require("./src/routes/adminDashboardRoutes");
const customerRoutes = require("./src/routes/customerRoutes");
const addressRoutes = require("./src/routes/addressRoutes");
const reportRoutes = require("./src/routes/reportRoutes");

app.use(helmet());
const allowedOrigins = [
    "http://localhost:5173",
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Not allowed by CORS"));
        },
    })
);
app.use(express.json({ limit: "1mb" }));
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication attempts. Please try again later.",
    },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/reports", reportRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "YOCANA E-Commerce API is running",
    });
});

const PORT = process.env.PORT || 5000;

pool.query("SELECT NOW()")
    .then((result) => {
        console.log("PostgreSQL connected:", result.rows[0].now);
    })
    .catch((error) => {
        console.error("Database connection failed:", error.message);
    });

app.listen(PORT, () => {
    console.log(`YOCANA server running on port ${PORT}`);
});