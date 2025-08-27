// ==== create_admin.js ====
const bcrypt = require("bcrypt");
const db = require("./db/connection");

async function crearUsuarioAdmin() {
  const nombre = "pepe";
  const email = "nicofa20000@gmail.com";
  const passwordPlano = "123456789";
  const telefono = "+543535655503";
  const nacimiento = "1985-11-09";
  const pais = "Argentina";
  const esAdmin = 1;

  const passwordHashed = await bcrypt.hash(passwordPlano, 10);

  db.run(
    `INSERT INTO usuarios (nombre, email, password, telefono, nacimiento, pais, esAdmin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nombre, email, passwordHashed, telefono, nacimiento, pais, esAdmin],
    (err) => {
      if (err) {
        console.error("❌ Error al crear usuario admin:", err.message);
      } else {
        console.log("✅ Usuario admin creado correctamente:", email);
      }
      db.close();
    }
  );
}

crearUsuarioAdmin();
