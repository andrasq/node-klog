'use strict';

module.exports = KlogClient;

var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

var aflow = require('aflow');
var qrpc = require('qrpc');
var QFputs = require('qfputs');
var FileWriter = require('qfputs').FileWriter;
var Qbuffer = require('qbuffer');

function KlogClient( logname, options ) {
    this.logname = logname;
    this.journalName = null;
    this.host = options.host || 'localhost';
    this.qrpcPort = options.qrpcPort || options.port || 4245;

    // use self.fs.* operations, easier to test
    this.fs = {
        open: fs.open,
        close: fs.close,
        read: fs.read,
        unlink: fs.unlink,
    };

    this.closed = false;
    this.journal = null;
    this.client = null;
    this._socket = null;
    this.flushing = false;
    this.emitter = new EventEmitter();
    this.flushIntervalMs = 10;  // flush 10ms after write
    this.dirty = false;         // need to fflush
    this._notifiedFlushError = false;

    if (options.journal !== undefined) {
        if (typeof options.journal === 'string') {
            this.journalName = options.journal;
            this.journal = new QFputs(new FileWriter(this.journalName, 'a'));
        } else {
            this.journalName = options.journalName;
            this.journal = options.journal;
        }
        this.emitter.setMaxListeners(100);
    }
}

/*
 * class method to construct a new klog logger
 */
KlogClient.createClient = function createClient( logname, options, callback ) {
    if (typeof logname !== 'string') throw new Error("logname required");

    if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
    }

    var klog = new KlogClient(logname, options);
    klog.client = qrpc.connect(this.qrpcPort, this.host, function(socket) {
        klog._socket = socket;
        // turn off Nagle delays, else sync is horribly slow
        socket.setNoDelay(true);
        if (callback) callback(null, klog);
    })

    return klog;
}

// append lines to the log
KlogClient.prototype.write = function write( lines, optionalCallback ) {
    // the 'write' message is send-only, it does not get a response
//process.stdout.write("w");
    if (this.journal) {
        if (!this.dirty) setTimeout(this._fflushKlog, this.flushIntervalMs, this);
        this.dirty = true;
        this.journal.write(lines);
    } else {
        this.client.call(this.logname + '_write', lines);
    }
    if (optionalCallback) optionalCallback();
}

KlogClient.prototype._fflushKlog = function _fflushKlog( klog ) {
    klog.fflush(function(err) {
        if (err && !klog._notifiedFlushError) {
            console.log("klogClient (%s) fflush error:", klog.journalName, err);
            klog._notifiedFlushError = true;
            // TODO: maybe support a way to reset the error?  or create a new client
        }
    });
}

// flush the appended lines to the backing store
KlogClient.prototype.fflush = function fflush( callback ) {
    var grabbedJournalName;
    var flushAgain;
    var self = this;

    if (this.journal) {
        grabbedJournalName = this.journalName + '.up';
        flushAgain = false;

        // register to be notified when the fflush completes
        this.emitter.once('flushDone', callback);

        // if fflush already in progress, it will flush our lines too
        if (this.flushing) return;

        // mark the client as not needing a flush unless written again
        this.flushing = true;
        this.dirty = false;

        _doFflush(self);
    }
    else {
        // flush to backing store on the server
        this.client.call(this.logname + '_fflush', callback);
    }

    function notifyCallback( self, err ) {
        if (err) {
            self.flushing = false;
            self.emitter.emit('flushDone', err);
        }
        else if (flushAgain) {
            // if flushAgain then only notify when the second pass completes
            flushAgain = false;
            _doFflush(self);
        }
        else {
            // else all done, notify callbacks
            // if written to during the flush, fflush again
            self.flushing = false;
            // self.emitter.emit('flushDone', err);
            // only notify that fflush done when all content has been transferred
            // this might mean a forever wait if another thread is writing the log in a loop
            if (self.dirty) {
                self._fflushKlog(self);
            }
            else {
                self.emitter.emit('flushDone', err);
            }
        }
    }

    function _doFflush( self ) {
        self.journal.fflush(function(err) {
            if (err) return notifyCallback(self, err);

            // send the journal contents to the klog server
            self.journal.renameFile(self.journalName, grabbedJournalName, function(err) {
                if (err && err.code === 'ENOENT') {
                    // if no journal file, another fflush might have removed it, nothing for us to do
                    return notifyCallback(self);
                }
                if (err && err.code === 'EEXIST') {
                    // flush the previously grabbed journal, then run again to flush the new
                    flushAgain = true;
                    err = null;
                }
                if (err) return notifyCallback(self, err);

                self._sendFileContents(grabbedJournalName, function(err) {
                    if (err) return notifyCallback(self, err);

                    self.client.call(self.logname + '_fflush', function(err) {
                        if (err) return notifyCallback(self, err);

                        self.fs.unlink(grabbedJournalName, function(err) {
                            notifyCallback(self, err);
                        });
                    });
                })
            })
        })
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

// expose all other available calls too (eg the benchmark 'quit')
KlogClient.prototype.call = function call( call, msg, cb ) {
    if (!cb && typeof msg === 'function') {
        cb = msg;
        msg = undefined;
    }
    this.client.call(call, msg, cb);
}

KlogClient.prototype._sendFileContents = function _sendFileContents( filename, callback ) {
    var self = this;
    var qbuf = new Qbuffer();
    var qbufBytes = 0;
    var newlineOffset;
    var chunkSize = 60e3;

    self.fs.open(filename, 'r', function(err, fd) {
        if (err) return callback(err);
        
        var buf = new Buffer(3 * chunkSize);
        aflow.repeatUntil(function(done) {
            self.fs.read(fd, buf, 0, buf.length, null, function(err, nbytes) {
                // TODO: should throttle the transfer rate to network speeds, to not buffer entire logfile
                if (err) return done(err);

                if (nbytes === 0) {
                    // if file has been read (no more bytes), send all the buffered bytes
                    if (qbuf.length > 0) sendChunk(qbuf, qbuf.length);
                    return done(null, true);
                }

                qbuf.write(new Buffer(buf.slice(0, nbytes)));
                if (qbuf.length < chunkSize) {
                    return done(null, false);
                }
                else {
                    // else gather up the bytes, send newline terminated chunks
                    aflow.repeatUntil(function(nextChunk) {
                        if (qbuf.length < chunkSize) return nextChunk(null, true);
                        newlineOffset = qbuf.indexOfChar('\n', chunkSize);
                        if (newlineOffset >= 0) {
                            sendChunk(qbuf, newlineOffset + 1);
                            nextChunk(null, false);
                        }
                        else nextChunk(null, true);
                    }, function(err) {
                        return done(err, false);
                    });
                }
            })
        },
        function(err, ret) {
            self.fs.close(fd, function(err2) {
                callback(err);
            });
        })
    })

    function sendChunk( qbuf, nbytes ) {
        var chunk = qbuf.read(nbytes);
        self.client.call(self.logname + '_write', chunk);
    }
}
