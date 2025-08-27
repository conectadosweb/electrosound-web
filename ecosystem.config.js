// ecosystem.config.js — Electro Sound Pack Web (producción)
module.exports = {
  apps: [
    {
      name: "conectadosweb",
      script: "./server.js",
      cwd: "/var/www/electrosoundpack.com",

      // Modo de ejecución
      exec_mode: "fork",
      instances: 1,

      // Reinicios/control
      watch: false,               // sin reinicios por cambios de archivos
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 5,
      max_memory_restart: "0",    // sin límite de memoria

      // Señales para cierre limpio
      stop_signal: "SIGTERM",
      kill_timeout: 5000,

      // Entorno
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    }
  ]
};
