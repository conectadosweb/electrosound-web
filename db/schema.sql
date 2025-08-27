-- ==== db/schema.sql ====

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    telefono TEXT,
    nacimiento TEXT,
    pais TEXT,
    esAdmin INTEGER DEFAULT 1
);

-- Tabla de carritos
CREATE TABLE IF NOT EXISTS carritos (
    email TEXT PRIMARY KEY,
    carrito TEXT NOT NULL
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY,
    nombre TEXT UNIQUE,
    descripcion TEXT,
    precio REAL,
    categoria TEXT,
    stock INTEGER,
    oferta INTEGER DEFAULT 0,
    nuevo INTEGER DEFAULT 1,
    disponible INTEGER DEFAULT 1,
    proveedor TEXT,
    fecha_creacion TEXT,
    imagen TEXT,
    visible INTEGER DEFAULT 1,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
