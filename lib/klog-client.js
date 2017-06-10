'use strict';


module.exports = KlogClient;

var qrpc = require('qrpc');

function KlogClient( options ) {
    if (!options) options = {};
    this.host = options.host || 'localhost';
    this.qrpcPort = options.qrpcPort || 4245;
    this.client = null;
}

KlogClient.prototype.createClient = function createClient( options, callback ) {
    var klog = new KlogClient(options);
    klog.client = qrpc.connect({ port: this.qrpcPort, host: this.host }, function(socket) {
        // turn off Nagle delays, else sync is horribly slow
        socket.setNoDelay(true);
        callback(klog);
    })
    return klog;
}

KlogClient.prototype.write = function write( lines, optionalCallback ) {
    // the 'write' call is send-only, it does not take a callback
    this.client.call('write');
    if (optionalCallback) optionalCallback();
}

KlogClient.prototype.sync = function sync( callback ) {
    this.client.call('sync', callback);
}

KlogClient.prototype.close = function close( callback ) {
    if (this.closed) return;
    this.client.close();
    if (callback) callback();
}
