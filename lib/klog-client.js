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
        klog.client.call('logname', logname);
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
    if (this.journal) {
        var grabbedJournalName = this.journalName + '.up';
        var flushAgain = false;

        // register to be notified when the fflush completes
        this.emitter.once('flushDone', callback);

        // if fflush already in progress, it will flush our lines too
        if (this.flushing) return;

        // mark the client as not needing a flush unless written again
        this.flushing = true;
        this.dirty = false;

        var self = this;
        _doFflush(self);

        function notifyCallback( self, err ) {
            if (err) {
//console.log("AR: fflush err", err);
                self.flushing = false;
                self.emitter.emit('flushDone', err);
            }
            else if (flushAgain) {
//console.log("AR: flushAgain");
                // if flushAgain then only notify when the second pass completes
                flushAgain = false;
                _doFflush(self);
            }
            else {
//console.log("AR: all done, dirty?", self.dirty);
                // else all done, notify callbacks
                // if written to during the flush, fflush again
                self.flushing = false;
                // self.emitter.emit('flushDone', err);
                // only notify that fflush done when all content has been transferred
                // this might mean a forever wait if another thread is writing the log in a loop
                if (self.dirty) self._fflushKlog(self);
                else self.emitter.emit('flushDone', err);
            }
        }

        function _doFflush( self ) {
            self.journal.fflush(function(err) {
//console.log("AR: flushed journal for %s to file %s, %d bytes", self.logname, self.journalName, err);
                if (err) return notifyCallback(self, err);

                // send the journal contents to the klog server
                self.journal.renameFile(self.journalName, grabbedJournalName, function(err) {
//console.log("AR: renamed file %s -> %s", self.journalName, grabbedJournalName, err);
//if (!err) console.log("AR: renamed file size", fs.readFileSync(grabbedJournalName).length);
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

//console.log("AR: sending file %s...", grabbedJournalName);
                    self._sendFileContents(grabbedJournalName, function(err) {
//console.log("AR: file sent", err);
                        if (err) return notifyCallback(self, err);

                        self.client.call(self.logname + '_fflush', function(err) {
                            if (err) return notifyCallback(self, err);

                            fs.unlink(grabbedJournalName, function(err) {
//console.log("AR: removed grabbed journal %s", grabbedJournalName);
                                notifyCallback(self, err);
                            });
                        });
                    })
                })
            })
        }
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

    fs.open(filename, 'r', function(err, fd) {
        if (err) return callback(err);
        
        aflow.repeatUntil(function(done) {
            var buf = new Buffer(3 * chunkSize);
            fs.read(fd, buf, 0, buf.length, null, function(err, nbytes) {
                if (err) return done(err);
                // TODO: should throttle the transfer rate to network speeds, to not buffer entire logfile
//console.log("AR: read chunk head", err, nbytes, buf.slice(190, 200).toString(), buf.slice(nbytes - 10, nbytes).toString());
//console.log("AR: read chunk tail", buf.slice(nbytes - 10, nbytes).toString());
                if (nbytes > 0) qbuf.write(buf.slice(0, nbytes));
//console.log("AR: qbuf now contains %d bytes", qbuf.length, qbuf.peek(200).slice(190).toString())
                if (nbytes === 0) {
//console.log("AR: short read, file is smaller than chunk", nbytes);
//console.log("AR: qbuf.length", qbuf.length);
                    // if file has been read, send the remaining buffered bytes
                    if (qbuf.length > 0) sendChunk(qbuf, qbuf.length, done, true);
                    else return done(null, true);
                }
                else if (qbuf.length < chunkSize) {
                    return done(null, false);
                }
                else {
//console.log("AR: gathered %d bytes", nbytes, buf.slice(190, 200).toString());
//console.log("AR: gathered tail", buf.slice(nbytes-10, nbytes).toString());
                    // else gather up the bytes, send newline terminated chunks
                    aflow.repeatUntil(function(nextChunk) {
                        if (qbuf.length > chunkSize) {
                            newlineOffset = qbuf.indexOfChar('\n', chunkSize);
//console.log("AR: newline at offset %d", newlineOffset);
                            if (newlineOffset >= 0) return sendChunk(qbuf, newlineOffset + 1, nextChunk, false);
                        }
                        else nextChunk(null, true);
                    }, function(err) {
                        done(err, false);
                    });
                }
            })
        },
        function(err, ret) {
//console.log("AR: done repeating", err, ret, new Error().stack);
            fs.close(fd, function(err2) {
//console.log("AR: closed file", filename, err2   );
                callback(err);
            });
        })
    })

    function sendChunk( qbuf, nbytes, cb, cbRetval ) {
        var chunk = qbuf.read(nbytes);
//console.log("AR: sending chunk %dB", nbytes, chunk.slice(190, 200).toString(), chunk.slice(nbytes-10, nbytes));
        self.client.call(self.logname + '_write', chunk);
        setImmediate(cb, null, cbRetval);
    }
}
