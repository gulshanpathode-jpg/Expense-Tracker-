module.exports = {
  apps: [
    {
      name: 'exptrack-backend',
      cwd: '/root/exp-track/backend',
      script: 'npm',
      args: 'run dev',
      env: { PORT: '8002' },
    },
    {
      name: 'exptrack-frontend',
      cwd: '/root/exp-track/frontend',
      script: 'npm',
      args: 'run dev -- --port 8004 --host 0.0.0.0',
    },
  ],
};
