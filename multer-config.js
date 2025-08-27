// ==== multer-config.js (Versión corregida y mejorada) ====
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const productId = req.params.id;
        const productDir = path.join(__dirname, '..', 'public', 'data', 'products', String(productId));
        
        if (!fs.existsSync(productDir)) {
            fs.mkdirSync(productDir, { recursive: true });
        }
        cb(null, productDir);
    },
    filename: (req, file, cb) => {
        const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9\.]/g, '_');
        cb(null, sanitizedFileName);
    }
});

const uploadImages = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        // Corrección del error
        cb(new Error("Solo se permiten archivos de imagen (jpeg, jpg, png, webp, gif)."), false);
    }
});

module.exports = uploadImages;