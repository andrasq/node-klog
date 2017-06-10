'use strict';


module.exports = KlogClient;

var qrpc = require('qrpc');

function KlogClient( options ) {
    if (!options) options = {};
    this.logname = options.logname;
    this.host = options.host || 'localhost';
    this.qrpcPort = options.qrpcPort || 4245;
    this.client = null;
}

KlogClient.prototype.createClient = function createClient( options, callback ) {
    var klog = new KlogClient(options);
    klog.client = qrpc.connect(this.qrpcPort, this.host, function(socket) {
        // turn off Nagle delays, else sync is horribly slow
        socket.setNoDelay(true);
        if (options.logname) klog.client.call('logname', options.logname);
        callback(klog);
    })
    return klog;
}

// arrange for future calls to be against the named log
KlogClient.prototype.logname = function logname( logname ) {
    this.client.call('logname', logname);
}

// append lines to the log
KlogClient.prototype.write = function write( lines, optionalCallback ) {
    // the 'write' call is send-only, it does not take a callback
    this.client.call('write');
    if (optionalCallback) optionalCallback();
}

// flush the appended lines to the backing store
KlogClient.prototype.sync = function sync( callback ) {
    this.client.call('sync', callback);
}

// close the connection
KlogClient.prototype.close = function close( callback ) {
    if (this.closed) return;
    this.client.close();
    if (callback) callback();
}
