'use strict';


module.exports = KlogClient;

var qrpc = require('qrpc');
var QFputs = require('qfputs');
var FileWriter = require('qfputs').FileWriter;

function KlogClient( logname, options ) {
    if (!options) options = {};

    this.logname = logname;
    this.journalName = options.journal;
    this.host = options.host || 'localhost';
    this.qrpcPort = options.qrpcPort || 4245;

    this.closed = false;
    this.client = null;
    this.journal = null;

    if (this.journalName) {
        this.journal = new QFputs(new FileWriter(this.journalName, 'a'));
    }
}

KlogClient.createClient = function createClient( logname, options, callback ) {
    if (typeof logname !== 'string') throw new Error("logname required");

    if (!callback) {
        callback = options;
        options = {};
    }

    var klog = new KlogClient(logname, options);
    klog.client = qrpc.connect(this.qrpcPort, this.host, function(socket) {
        // turn off Nagle delays, else sync is horribly slow
        socket.setNoDelay(true);
        klog.client.call('logname', logname);
        if (callback) callback(null, klog);
    })

    return klog;
}

// arrange for future calls to be against the named log
KlogClient.prototype.setLogname = function logname( logname ) {
    if (typeof logname !== 'string') throw new Error("logname required");

    this.logname = logname;
    this.client.call('logname', logname);
}

// append lines to the log
KlogClient.prototype.write = function write( lines, optionalCallback ) {
    // the 'write' call is send-only, it does not take a callback
    this.client.call('write', lines);
    if (optionalCallback) optionalCallback();
}

// flush the appended lines to the backing store
KlogClient.prototype.fflush = function fflush( callback ) {
    var self = this;
    if (this.journal) {
        this.journal.fflush(function(err) {
            if (err) return callback(err);
/**
            FileWriter.renameJournal(self.journalName, self.journalName + '.up', function(err, grabbed) {
            })
**/
            // upload the local journal to the server
            // TODO: WRITEME
        })
    }
    else {
        // sync the server
        this.client.call('sync', callback);
    }
}

// close the connection
KlogClient.prototype.close = function close( callback ) {
    if (!this.closed) {
        this.closed = true;
        this.client.close();
    }
    if (callback) callback();
}
