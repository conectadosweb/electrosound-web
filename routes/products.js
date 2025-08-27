// ==== routes/products.js (Corregido y unificado) ====
const express = require('express');
const db = require('../db/connection');
const router = express.Router();
const path = require("path");
const fs = require("fs").promises; // Usar la versión con promesas para async/await

// Función de utilidad para normalizar valores a 1 o 0
// CORREGIDO: Ahora reconoce 'si', '1' y true como valores verdaderos
const normalizeBoolean = (value) => {
    const lowerVal = String(value).toLowerCase();
    if (lowerVal === '1' || lowerVal === 'si' || lowerVal === 'true' || value === 1 || value === true) {
        return 1;
    }
    return 0;
};

// === Unificamos la ruta de listado de productos para manejar filtros y búsqueda ===
router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    const filter = req.query.filter;
    const searchQuery = req.query.q?.toLowerCase() || "";

    // La consulta ahora busca directamente los valores 1 o 0
    let sql = `SELECT id, nombre, categoria, descripcion, precio, disponible, oferta, nuevo, imagen FROM productos WHERE visible = 1`;
    const params = [];

    // Lógica para el filtro de productos
    if (filter && filter !== 'all') {
        const fieldMap = {
            'oferta': 'oferta',
            'nuevo': 'nuevo',
            'disponible': 'disponible'
        };
        const field = fieldMap[filter];
        if (field) {
            sql += ` AND ${field} = ?`;
            // CORRECCIÓN: Usamos la función normalizeBoolean para asegurar que el filtro sea siempre 1
            params.push(normalizeBoolean(1)); 
        }
    }
    
    // Lógica para la búsqueda de productos (se combina con el filtro)
    if (searchQuery) {
        sql += ` AND (LOWER(nombre) LIKE ? OR LOWER(descripcion) LIKE ?)`;
        params.push(`%${searchQuery}%`);
        params.push(`%${searchQuery}%`);
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('❌ Error al consultar productos:', err);
            return res.status(500).json({ error: 'Error interno del servidor al consultar productos.' });
        }
        
        // No se necesita normalizar aquí si los datos ya están en 0/1
        res.json(rows);
    });
});


router.get('/allBasic', (req, res) => {
    // La consulta ahora busca directamente los valores 1 o 0
    db.all("SELECT id, nombre, categoria, disponible FROM productos WHERE visible = 1 ORDER BY nombre ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: "No se pudieron cargar los productos." });
        
        // No se necesita normalizar si los datos ya están en 0/1
        res.json(rows);
    });
});


// === Ruta para obtener los archivos de un producto ===
router.get('/:id/files', async (req, res) => {
    const productId = req.params.id;
    if (!/^\d+$/.test(productId)) {
        return res.status(400).json({ error: "ID de producto inválido." });
    }
    const productPath = path.join(__dirname, '..', 'public', 'data', 'products', productId);

    try {
        const files = await fs.readdir(productPath);
        const relevantFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov'].includes(ext);
        });

        res.json(relevantFiles);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`⚠️ Directorio de archivos no encontrado para el producto ${productId}`);
            return res.status(404).json({ files: [] });
        }
        console.error(`❌ Error al leer el directorio para el producto ${productId}:`, error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});


// === Ruta para la descarga de CSV (Ya estaba en el server.js, pero la incluimos para una ruta completa de productos) ===
router.get('/export', (req, res) => {
    db.all("SELECT * FROM productos", (err, rows) => {
        if (err) return res.status(500).send("Error al leer productos");

        if (!rows || rows.length === 0) {
            return res.status(404).send("No hay productos para exportar");
        }

        const header = Object.keys(rows[0]).join(",") + "\n";
        const content = rows
            .map(row => Object.values(row)
                .map(v => `"${(v ?? "").toString().replace(/"/g, '""')}"`).join(","))
            .join("\n");

        const csv = header + content;

        res.setHeader("Content-Disposition", "attachment; filename=productos_export.csv");
        res.setHeader("Content-Type", "text/csv");
        res.status(200).send(csv);
    });
});

module.exports = router;