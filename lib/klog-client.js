'use strict';


module.exports = KlogClient;

var fs = require('fs');
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

// append lines to the log
KlogClient.prototype.write = function write( lines, optionalCallback ) {
    // the 'write' message is send-only, it does not get a response
    this.client.call(this.logname + '_write', lines);
    if (optionalCallback) optionalCallback();
}

// flush the appended lines to the backing store
KlogClient.prototype.fflush = function fflush( callback ) {
    if (this.journal) {
        var self = this;
        var grabbedJournalName = this.journalName + '.up';

        this.journal.fflush(function(err) {
            if (err) return callback(err);

            FileWriter.renameJournal(self.journalName, grabbedJournalName, function(err, grabbed) {
                fs.readFile(grabbedJournalName, function(err, contents) {
                    // TODO: read in batches, not whole-file-at-once
                    if (err) return callback(err);
                    this.client.call(this.logname + '_write', contents);
                    this.client.call(this.logname + '_fflush', callback);
                })
            })
        })
    }
    else {
        // flush to backing store on the server
        this.client.call(this.logname + '_fflush', callback);
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
