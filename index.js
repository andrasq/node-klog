module.exports = {
    httpPort: 4244,
    qrpcPort: 4245,
    createServer: require('./lib/klog-server.js').createServer,
    createClient: require('./lib/klog-client.js').createClient,
};
