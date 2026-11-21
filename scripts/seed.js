require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../src/config/db");

async function runSeed() {
    console.log("Seeding clean database...");
    const seedPath = path.join(__dirname, "..", "migrations", "seed_data.sql");
    const sql = fs.readFileSync(seedPath, "utf8");

    try {
        await pool.query(sql);
        console.log("✔ Clean seed data applied successfully!");
        process.exit(0);
    } catch (error) {
        console.error("✖ Seed failed:", error.message);
        process.exit(1);
    }
}

runSeed().catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
});
