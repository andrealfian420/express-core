module.exports = {
  apps: [
    {
      name: 'api',
      script: 'src/server.js',
      instances: 'max', // Run as many instances as there are CPU cores
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker',
      script: 'src/worker.js',
      instances: 1, // Run a single instance of the worker
      exec_mode: 'fork', // Use fork mode for the worker
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
