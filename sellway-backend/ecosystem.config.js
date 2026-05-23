module.exports = {
  apps: [
    {
      name: 'sellway-api',
      script: 'src/server.js',
      instances: 'max',        // все ядра CPU
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'sellway-bot',
      script: 'src/telegram/bot.js',
      instances: 1,            // бот — только 1 экземпляр!
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/bot-error.log',
      out_file: 'logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
