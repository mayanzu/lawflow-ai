module.exports = {
  apps: [
    {
      name: 'lawflow-backend',
      script: 'backend/server.py',
      interpreter: 'python3',
      args: '-u',
      cwd: '/opt/lawflow',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 10000,
      watch: false,
      env: {
        PYTHONUNBUFFERED: '1'
      },
      error_file: '/root/.pm2/logs/lawflow-backend-error.log',
      out_file: '/root/.pm2/logs/lawflow-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'lawflow-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3456',
      cwd: '/opt/lawflow',
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: '/root/.pm2/logs/lawflow-frontend-error.log',
      out_file: '/root/.pm2/logs/lawflow-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
}
