// ==== middleware/auth.js (Código CORREGIDO) ====
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('CRÍTICO: La variable de entorno JWT_SECRET no está definida. ¡La aplicación no puede iniciar de forma segura!');
    process.exit(1);
}

function authenticateToken(req, res, next) {
    // Primero, busca el token en el encabezado de autorización
    let token = req.headers['authorization']?.split(' ')[1];
  
    // Si no se encuentra en el encabezado, busca en el parámetro de consulta
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (token == null) {
        return res.status(401).json({ message: "Acceso denegado. No se proporcionó token de autenticación." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Token inválido o expirado. Acceso denegado." });
        }
        req.user = user;
        next();
    });
}

function authorizeAdmin(req, res, next) {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        return res.status(403).json({ message: "Acceso denegado. No tienes permisos de administrador." });
    }
}

module.exports = {
    authenticateToken,
    authorizeAdmin
};