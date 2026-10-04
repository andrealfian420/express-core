// Purpose: PM2 process definitions for non-Docker deployments (API cluster + single worker).
// Caller: `pm2 start ecosystem.config.js --env production`.
// Dependencies: Compiled dist/ output, project-root .env (loaded by src/config/env.ts).
// Main Functions: apps — `api` (cluster, one per CPU) and `worker` (fork, single instance;
//   it owns the cron schedules, so it must not be scaled without slot-id deduplication).
// Side Effects: Starts and stops Node processes.
// Notes: `cwd` pins relative paths (.env, client/storage) to the project root whatever
//   directory pm2 is started from. `kill_timeout` must exceed the in-process shutdown
//   timeout (API 15 s, worker 30 s) or PM2 kills the process before resources are released.
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 'max', // Run as many instances as there are CPU cores
      exec_mode: 'cluster',
      kill_timeout: 20000,
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker',
      script: 'dist/jobs/run-workers.js',
      cwd: __dirname,
      instances: 1, // Single instance: this process owns the cron schedules
      exec_mode: 'fork', // Use fork mode for the worker
      kill_timeout: 35000,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
