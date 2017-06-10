'use strict';


module.exports = KlogClient;

var qrpc = require('qrpc');

function KlogClient( logname, options ) {
    if (!options) options = {};
    this.logname = logname;
    this.host = options.host || 'localhost';
    this.qrpcPort = options.qrpcPort || 4245;
    this.client = null;
}

KlogClient.prototype.createClient = function createClient( logname, options, callback ) {
    if (!logname) throw new Error("logname required");

    var klog = new KlogClient(logname, options);
    klog.client = qrpc.connect(this.qrpcPort, this.host, function(socket) {
        // turn off Nagle delays, else sync is horribly slow
        socket.setNoDelay(true);
        klog.client.call('logname', logname);
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
KlogClient.prototype.fflush = function sync( callback ) {
    // flush the local journal
    // TODO: WRITEME

    // upload the local journal to the server
    // TODO: WRITEME

    // sync the server
    this.client.call('sync', callback);
}

// close the connection
KlogClient.prototype.close = function close( callback ) {
    if (this.closed) return;
    this.client.close();
    if (callback) callback();
}
