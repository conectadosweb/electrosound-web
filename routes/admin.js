// ==== routes/admin.js (Final y corregido) ====
const express = require("express");
const fs = require("fs");              // API sincrónica
const fsp = fs.promises;               // API de promesas
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcrypt");
const db = require("../db/connection");
const router = express.Router();
const csv = require("csv-parser");

// Middleware de autenticación y autorización
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------
function ensureDir(p) {
  // Crea la carpeta si no existe (sincrónico, seguro y cross-platform)
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

const parseBool = (val) => {
  const lowerVal = String(val).toLowerCase();
  // Corregido: se manejan los valores de texto '1' y '0' como booleanos
  return (lowerVal === '1' || lowerVal === 'si' || lowerVal === 'true' || val === 1) ? 1 : 0;
};

function safeName(original) {
  const ext = path.extname(original || '').toLowerCase();
  const base = path.basename(original || 'file', ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9._-]+/gi, '-')                 // slug
    .toLowerCase();
  return `${base}${ext}`;
}

// -------------------------------------------------------------
// Multer (unificado) -> Guarda en /public/data/products/:id
// -------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!/^\d+$/.test(id)) {
        return cb(new Error("ID de producto inválido o faltante"));
      }
      const dest = path.join(__dirname, '..', 'public', 'data', 'products', id);
      ensureDir(dest);
      cb(null, dest);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      cb(null, safeName(file.originalname));
    } catch (err) {
      cb(err);
    }
  }
});

const upload = multer({
  storage,
});

// -------------------------------------------------------------
// RUTA DE SUBIDA (única)
// POST /api/admin/upload/:id   -> campo 'images' (hasta 30)
// -------------------------------------------------------------
router.post('/upload/:id', authenticateToken, authorizeAdmin, upload.array('images', 30), (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: "ID de producto inválido." });
  }

  const saved = (req.files || []).map(f => f.filename);
  const dest = path.join('public', 'data', 'products', id).replace(/\\/g, '/');

  console.log('➡️ Archivos guardados en', dest, saved);

  return res.json({
    ok: true,
    id,
    destino: `/${dest}`,
    cantidad: saved.length,
    files: saved
  });
});

// -------------------------------------------------------------
// === Rutas de productos ===
// LISTAR PRODUCTOS CON PAGINACIÓN Y BÚSQUEDA
router.get("/products", async (req, res) => {
  const search = req.query.q?.toLowerCase() || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    let sql = "SELECT id, nombre, descripcion, categoria, proveedor, precio, stock, oferta, nuevo, disponible, visible, imagen, fecha_creacion, updatedAt FROM productos";
    let countSql = "SELECT COUNT(*) AS total FROM productos";
    const params = [];

    if (search) {
      sql += " WHERE nombre LIKE ? OR categoria LIKE ? OR proveedor LIKE ?";
      countSql += " WHERE nombre LIKE ? OR categoria LIKE ? OR proveedor LIKE ?";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const totalRows = await new Promise((resolve, reject) => {
      db.get(countSql, search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    const rows = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    res.json({ products: rows, total: totalRows.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar productos" });
  }
});

// Obtener un producto por ID
router.get("/product/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await new Promise((resolve, reject) => {
      // Corregido: se selecciona todos los campos para que el modal los obtenga
      db.get("SELECT * FROM productos WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!product) return res.status(404).json({ error: "Producto no encontrado." });
    res.json(product);
  } catch (err) {
    return res.status(500).json({ error: "Error en la base de datos." });
  }
});

// CREAR un nuevo producto
router.post("/product", async (req, res) => {
  const { nombre, precio, descripcion, categoria, proveedor, imagen, oferta, nuevo, disponible, visible, stock } = req.body;
  if (!nombre || !precio) {
    return res.status(400).json({ error: "El nombre y el precio son obligatorios." });
  }
  const fechaActual = new Date().toISOString();
  // Corregido: se utiliza `fecha_creacion` en lugar de `createdAt`
  const sql = `INSERT INTO productos (nombre, precio, descripcion, categoria, proveedor, imagen, oferta, nuevo, disponible, visible, stock, fecha_creacion, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const valores = [
    nombre,
    precio,
    descripcion || null,
    categoria || null,
    proveedor || null,
    imagen || null,
    parseBool(oferta),
    parseBool(nuevo),
    parseBool(disponible),
    parseBool(visible),
    parseInt(stock) || 0,
    fechaActual,
    fechaActual
  ];
  db.run(sql, valores, function(err) {
    if (err) {
      console.error("❌ Error al insertar nuevo producto:", err);
      return res.status(500).json({ error: "Error al crear el producto." });
    }
    const newProductId = this.lastID;
    const dir = path.join(__dirname, "../public/data/products", newProductId.toString());
    fsp.mkdir(dir, { recursive: true })
      .then(() => {
        res.status(201).json({
          message: "Producto creado exitosamente.",
          id: newProductId
        });
      })
      .catch(err => {
        console.error("❌ Error al crear directorio para el producto:", err);
        res.status(201).json({
          message: "Producto creado exitosamente (sin carpeta).",
          id: newProductId
        });
      });
  });
});

// Actualizar producto por ID
router.put("/product/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({ error: "No se enviaron campos a actualizar." });
  }
  const allowedFields = ['nombre', 'precio', 'descripcion', 'categoria', 'proveedor', 'imagen', 'oferta', 'nuevo', 'disponible', 'visible', 'stock'];
  const campos = Object.keys(body).filter(key => allowedFields.includes(key));
  const setClauseParts = campos.map(key => `${key} = ?`);

  const valores = campos.map(key => {
    if (['oferta', 'nuevo', 'disponible', 'visible'].includes(key)) {
      return parseBool(body[key]);
    }
    return body[key];
  });

  valores.push(id);
  const sql = `UPDATE productos SET ${setClauseParts.join(", ")}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;
  db.run(sql, valores, function (err) {
    if (err) {
      console.error("❌ Error al actualizar producto:", err);
      return res.status(500).json({ error: "Error interno al actualizar el producto." });
    }
    res.json({ message: "Producto actualizado correctamente." });
  });
});

// Eliminar producto completamente por ID
router.delete("/product/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "ID de producto inválido." });
  }
  db.run("DELETE FROM productos WHERE id = ?", [id], async function (err) {
    if (err) {
      console.error("❌ Error al eliminar producto:", err);
      return res.status(500).json({ error: "Error al eliminar el producto." });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Producto no encontrado para eliminar." });
    }
    const productDir = path.join(__dirname, "../public/data/products", id);
    try {
      await fsp.rm(productDir, { recursive: true, force: true });
      res.json({ message: "🗑️ Producto y carpeta eliminados correctamente." });
    } catch (rmErr) {
      console.warn("⚠️ Producto eliminado, pero no se pudo borrar su carpeta:", rmErr.message);
      res.json({ message: "🗑️ Producto eliminado correctamente, pero la carpeta no se pudo borrar." });
    }
  });
});

// -------------------------------------------------------------
// === Rutas de usuarios ===
// LISTAR USUARIOS CON PAGINACIÓN Y BÚSQUEDA
router.get("/users", async (req, res) => {
  const search = req.query.q?.toLowerCase() || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    let sql = "SELECT nombre, email, telefono, nacimiento, pais, esAdmin FROM usuarios";
    let countSql = "SELECT COUNT(*) AS total FROM usuarios";
    const params = [];

    if (search) {
      sql += " WHERE nombre LIKE ? OR email LIKE ?";
      countSql += " WHERE nombre LIKE ? OR email LIKE ?";
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const totalRows = await new Promise((resolve, reject) => {
      db.get(countSql, search ? [`%${search}%`, `%${search}%`] : [], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    const rows = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    res.json({ users: rows, total: totalRows.total });
  } catch (err) {
    res.status(500).json({ error: "Error al buscar usuarios" });
  }
});

// Obtener un usuario por email
router.get("/user/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT email, nombre, telefono, nacimiento, pais, esAdmin FROM usuarios WHERE email = ?", [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
    res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "Error en la base de datos." });
  }
});

// Actualizar usuario
router.put("/user/:email", async (req, res) => {
  const { email } = req.params;
  const { nombre, telefono, nacimiento, pais, password, esAdmin } = req.body;
  try {
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM usuarios WHERE email = ?", [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    const campos = [];
    const valores = [];
    if (nombre) { campos.push("nombre = ?"); valores.push(nombre); }
    if (telefono) { campos.push("telefono = ?"); valores.push(telefono); }
    if (nacimiento) { campos.push("nacimiento = ?"); valores.push(nacimiento); }
    if (pais) { campos.push("pais = ?"); valores.push(pais); }
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      campos.push("password = ?");
      valores.push(hashed);
    }
    if (typeof esAdmin !== "undefined") {
      campos.push("esAdmin = ?");
      valores.push(parseBool(esAdmin));
    }
    if (campos.length === 0) {
      return res.status(400).json({ error: "No se enviaron campos a actualizar." });
    }
    valores.push(email);
    const sql = `UPDATE usuarios SET ${campos.join(", ")} WHERE email = ?`;
    await new Promise((resolve, reject) => {
      db.run(sql, valores, (err) => {
        if (err) reject(err);
        resolve();
      });
    });
    res.json({ message: "Usuario actualizado correctamente." });
  } catch (err) {
    return res.status(500).json({ error: "Error al actualizar el usuario." });
  }
});


// ELIMINAR un usuario por email
router.delete("/user/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await new Promise((resolve, reject) => {
      db.run("DELETE FROM usuarios WHERE email = ?", [email], function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
    if (result.changes === 0) {
      return res.status(404).json({ error: "Usuario no encontrado para eliminar." });
    }
    res.json({ message: "🗑️ Usuario eliminado correctamente." });
  } catch (err) {
    console.error("❌ Error al eliminar usuario:", err);
    return res.status(500).json({ error: "Error al eliminar el usuario." });
  }
});

// -------------------------------------------------------------
// === Rutas de gestión de archivos (listar/eliminar) ===
router.get('/products/:id/files', async (req, res) => {
  const productId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(productId)) {
    return res.status(400).json({ error: "ID de producto inválido." });
  }
  const productPath = path.join(__dirname, '..', 'public', 'data', 'products', productId);

  try {
    const files = await fsp.readdir(productPath);
    const relevantFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.gif'].includes(ext);
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

router.delete("/image/:id/:file", async (req, res) => {
  const { id, file } = req.params;
  const filePath = path.join(__dirname, "../public/data/products", id, file);
  try {
    await fsp.unlink(filePath);
    return res.json({ message: `🗑️ Archivo eliminado: ${file}` });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: "Archivo no encontrado." });
    }
    return res.status(500).json({ error: "Error al eliminar el archivo." });
  }
});

// -------------------------------------------------------------
// === Subir archivo CSV de productos ===
const csvUpload = multer({ dest: "uploads/" });

router.post('/upload-csv', csvUpload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No se ha subido ningún archivo.'
    });
  }

  const csvFilePath = req.file.path;
  const resultados = [];
  const fallos = [];
  let insertados = 0;
  let actualizados = 0;
  let carpetasCreadas = 0;

  try {
    await new Promise((resolve, reject) => {
      require('fs').createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => resultados.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    const promesas = resultados.map(async (row) => {
      try {
        const cleanedRow = Object.keys(row).reduce((acc, key) => {
          acc[key.toLowerCase()] = row[key];
          return acc;
        }, {});

        const { id, nombre, descripcion, precio, categoria, stock, oferta, nuevo, disponible, proveedor, imagen, visible } = cleanedRow;

        if (!id || !nombre) {
          fallos.push({ id: 'N/A', error: 'Fila sin ID o nombre' });
          return;
        }

        const productDir = path.join(__dirname, '..', 'public/data/products', String(id));
        try {
          await fsp.mkdir(productDir, { recursive: true });
          carpetasCreadas++;
        } catch (err) {
          if (err.code !== 'EEXIST') {
            fallos.push({ id: id, error: `Error al crear carpeta: ${err.message}` });
            return;
          }
        }

        const existingProduct = await new Promise((resolve, reject) => {
          db.get("SELECT id FROM productos WHERE id = ?", [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        const fechaActual = new Date().toISOString();
        const data = [
          nombre,
          descripcion || '',
          parseFloat(precio) || 0,
          categoria || 'General',
          parseInt(stock) || 0,
          parseBool(oferta),
          parseBool(nuevo),
          parseBool(disponible),
          proveedor || 'Desconocido',
          imagen || '',
          parseBool(visible),
        ];

        if (existingProduct) {
          data.push(fechaActual, id);
          await new Promise((resolve, reject) => {
            // Corregido: se utiliza `fecha_creacion` en la consulta
            db.run(
              `UPDATE productos
               SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, stock = ?,
                   oferta = ?, nuevo = ?, disponible = ?, proveedor = ?, imagen = ?, visible = ?,
                   updatedAt = ?
               WHERE id = ?`,
              data,
              function (err) {
                if (err) reject(err);
                else { actualizados++; resolve(); }
              }
            );
          });
        } else {
          const insertData = [id, ...data, fechaActual, fechaActual];
          const insertSql = `INSERT INTO productos
             (id, nombre, descripcion, precio, categoria, stock, oferta, nuevo, disponible, proveedor, imagen, visible, fecha_creacion, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          await new Promise((resolve, reject) => {
            db.run(insertSql, insertData, function (err) {
              if (err) reject(err);
              else { insertados++; resolve(); }
            });
          });
        }
      } catch (dbErr) {
        fallos.push({ id: row.id || 'N/A', error: dbErr.message });
      }
    });

    await Promise.all(promesas);

    await fsp.unlink(csvFilePath);

    res.json({
      success: true,
      message: 'Importación de CSV finalizada.',
      resumen: {
        total: resultados.length,
        insertados: insertados,
        actualizados: actualizados,
        fallidos: fallos.length,
        carpetasCreadas: carpetasCreadas,
        fallos: fallos,
      }
    });
  } catch (error) {
    console.error('❌ Error al procesar el archivo CSV:', error);
    try { await fsp.unlink(csvFilePath); } catch (e) { console.warn('Error al limpiar archivo temporal:', e); }
    res.status(500).json({
      success: false,
      error: 'Error al procesar el archivo CSV.',
      detalles: error.message
    });
  }
});

async function exportToCsv(req, res) {
  const { tabla } = req.params;
  if (!['productos', 'usuarios'].includes(tabla)) {
    return res.status(400).json({ error: 'Tabla no válida.' });
  }
  
  let sql;
  if (tabla === 'productos') {
    // Corregido: se utiliza `fecha_creacion` en lugar de `createdAt`
    sql = `SELECT id, nombre, precio, descripcion, categoria, stock, oferta, nuevo, disponible, proveedor, imagen, visible, fecha_creacion FROM productos`;
  } else if (tabla === 'usuarios') {
    sql = `SELECT email, nombre, telefono, nacimiento, pais, esAdmin FROM usuarios`;
  }

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron datos para exportar.' });
    }

    const headers = Object.keys(rows[0]).join(',') + '\n';
    const csvContent = rows.map(row => Object.values(row).join(',')).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="conectados_${tabla}_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(headers + csvContent);
  } catch (err) {
    console.error(`❌ Error al exportar ${tabla} a CSV:`, err);
    res.status(500).json({ error: 'Error al generar el archivo CSV.' });
  }
}

// Exportar el router y la función de exportación
module.exports = {
  router,
  exportToCsv,
};