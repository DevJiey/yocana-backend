require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../src/config/db");

async function runMigrations() {
    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql") && file.startsWith("00"))
        .sort();

    console.log("Running migrations...");

    for (const file of files) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf8");

        try {
            await pool.query(sql);
            console.log(`✔ Successfully applied: ${file}`);
        } catch (error) {
            console.error(`✖ Failed to apply ${file}:`, error.message);
            process.exit(1);
        }
    }

    console.log("All migrations executed successfully.");
    process.exit(0);
}

runMigrations().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
});
