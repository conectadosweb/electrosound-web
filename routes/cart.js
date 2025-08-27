// ==== routes/cart.js (Versión corregida y mejorada) ====
const express = require('express');
const db = require('../db/connection');
const router = express.Router();

router.post('/save', (req, res) => {
    const email = req.user.email;
    const { cart } = req.body;
    if (!Array.isArray(cart)) {
      return res.status(400).json({ error: 'Datos de carrito inválidos.' });
    }

    db.run(
      `INSERT OR REPLACE INTO carritos (email, carrito) VALUES (?, ?)`,
      [email, JSON.stringify(cart)],
      err => {
        if (err) {
          console.error("Error al guardar carrito:", err.message);
          return res.status(500).json({ error: 'No se pudo guardar.' });
        }
        res.json({ message: 'Carrito guardado.' });
      }
    );
});


// CORRECCIÓN Y MEJORA: Agregamos una ruta para manejar la solicitud sin la barra final
// Esto asegura que GET /api/cart y GET /api/cart/ sean manejadas
router.get('/', (req, res) => { 
    const email = req.user.email;
    db.get(`SELECT carrito FROM carritos WHERE email = ?`, [email], (err, row) => {
        if (err) {
            console.error("Error al obtener carrito de la base de datos:", err);
            return res.status(500).json({ error: 'Error al procesar el carrito.' });
        }
        if (!row || !row.carrito) {
            // Si no hay fila o el campo carrito está vacío, devolvemos un array vacío
            return res.json({ carrito: [] });
        }
        try {
            res.json({ carrito: JSON.parse(row.carrito) });
        } catch (parseErr) {
            // Si el JSON es inválido, devolvemos un error y un array vacío
            console.error("Error al analizar JSON del carrito:", parseErr);
            res.status(500).json({ error: 'Datos de carrito corruptos.' });
        }
    });
});

module.exports = router;