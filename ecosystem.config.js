module.exports = {
    apps: [
        {
            env: { NODE_ENV: 'production' },
            script: 'lib/server.js',
            args: ['--port=3123'],
            name: 'net-level',
            watch: ['lib']
        }
    ]
};
