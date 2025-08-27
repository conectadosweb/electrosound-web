// ==== db/init.js (Corregido) ====
const fs = require("fs").promises;
const path = require("path");
const db = require("./connection");

async function initializeDatabase() {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");
        const schemaSQL = await fs.readFile(schemaPath, "utf8");

        const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
        
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                statements.forEach(stmt => {
                    db.run(stmt, err => {
                        if (err) {
                            console.error("❌ Error al ejecutar esquema:", err.message);
                        }
                    });
                });
                console.log("✅ Base de datos inicializada desde schema.sql");
                resolve();
            });
        });
        
    } catch (err) {
        console.error("❌ Error fatal al inicializar la base de datos:", err);
        throw err;
    }
}

module.exports = initializeDatabase;