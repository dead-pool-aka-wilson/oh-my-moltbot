module.exports = {
  apps: [{
    name: 'oh-my-moltbot-executor',
    script: 'bun',
    args: 'run src/autonomous/daemon.ts',
    cwd: '/Users/koed/Dev/oh-my-moltbot',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '~/.clawdbot/logs/executor-error.log',
    out_file: '~/.clawdbot/logs/executor-out.log',
    merge_logs: true,
    time: true,
  }]
};
