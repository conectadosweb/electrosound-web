// ==== routes/auth.js (Corregido y con mejora de seguridad) ====
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db/connection");
const { authenticateToken } = require("../middleware/auth");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('CRÍTICO: JWT_SECRET no definida en auth.js. Esto no debería ocurrir si server.js se inicia correctamente.');
  process.exit(1);
}

// ==========================
// Registro de usuario
// ==========================
router.post("/register", async (req, res) => {
  const {
    nombre,
    email,
    password,
    confirmPassword,
    telefono,
    nacimiento,
    pais
  } = req.body;

  // Validación de entradas
  if (!nombre || !email || !password || !confirmPassword || !telefono) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Las contraseñas no coinciden." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  db.get("SELECT * FROM usuarios WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error("Error en DB al buscar usuario para registro:", err);
      return res.status(500).json({ error: "Error en la base de datos." });
    }

    if (user) return res.status(400).json({ error: "El email ya está registrado." });

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Por defecto, un nuevo usuario no es administrador
    db.run(
      `INSERT INTO usuarios (nombre, email, password, telefono, nacimiento, pais, esAdmin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, email, hashedPassword, telefono, nacimiento || null, pais || null, 0],
      function (err) {
        if (err) {
          console.error("Error al insertar nuevo usuario:", err);
          return res.status(500).json({ error: "No se pudo registrar el usuario." });
        }
        res.status(201).json({
          message: "Usuario registrado correctamente.",
          user: { id: this.lastID, nombre, email, esAdmin: 0 }
        });
      }
    );
  });
});

// ==========================
// Login de usuario
// ==========================
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Faltan email o contraseña." });

  db.get("SELECT * FROM usuarios WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error("Error en DB al buscar usuario para login:", err);
      return res.status(500).json({ error: "Error en la base de datos." });
    }

    if (!user) return res.status(401).json({ error: "Credenciales inválidas." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Credenciales inválidas." });

    const isAdmin = user.esAdmin === 1;
    const token = jwt.sign({ id: user.id, email: user.email, isAdmin }, JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({
      token,
      user: {
        nombre: user.nombre,
        email: user.email,
        esAdmin: isAdmin
      }
    });
  });
});

// ==========================
// Obtener datos del usuario por email (PROTEGIDA)
// ==========================
router.get("/:email", authenticateToken, (req, res) => {
  const userEmail = req.user.email;
  db.get("SELECT nombre, email, telefono, nacimiento, pais, esAdmin FROM usuarios WHERE email = ?", [userEmail], (err, user) => {
    if (err) {
      console.error("Error en DB al obtener usuario por email:", err);
      return res.status(500).json({ error: "Error interno del servidor." });
    }
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json({
      user: {
        ...user,
        esAdmin: user.esAdmin === 1
      }
    });
  });
});

// ==========================
// Actualizar datos del usuario (PROTEGIDA)
// ==========================
router.put("/update", authenticateToken, async (req, res) => {
  const email = req.user.email;
  const { nombre, telefono, nacimiento, pais, newPassword } = req.body;

  db.get("SELECT * FROM usuarios WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error("Error en DB al buscar usuario para actualizar:", err);
      return res.status(500).json({ error: "Error en la base de datos." });
    }
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar." });
    }

    let hashedPassword = user.password;
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
      }
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const sql = `UPDATE usuarios SET nombre = ?, telefono = ?, nacimiento = ?, pais = ?, password = ? WHERE email = ?`;
    db.run(sql, [nombre, telefono, nacimiento || null, pais || null, hashedPassword, email], function (err) {
      if (err) {
        console.error("Error al actualizar usuario en DB:", err);
        return res.status(500).json({ error: "No se pudieron actualizar los datos del usuario." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Usuario no encontrado o no se realizaron cambios." });
      }
      res.json({
        message: "Datos de usuario actualizados correctamente.",
        user: {
          nombre,
          email,
          telefono,
          nacimiento,
          pais
        }
      });
    });
  });
});

module.exports = router;