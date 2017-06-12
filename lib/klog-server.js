'use strict';

module.exports = KlogServer;

var aflow = require('aflow');
var express = require('express');
var restiq = require('restiq');
var qrpc = require('qrpc');

function KlogServer( options ) {
    if (!options) options = {};
    this.httpPort = options.httpPort;
    this.qrpcPort = options.qrpcPort;
    this.expressPort = options.expressPort;
    this.logs = options.logs || {};
    this.httpServer = null;
    this.qrpcServer = null;
    this.closed = false;
}

KlogServer.prototype.close = function close( cb ) {
    var self = this;
    if (this.closed) return cb();
    this.closed = true;
    aflow.series([
        function(next) { self.qrpcServer ? self.qrpcServer.close(next) : next() },
        function(next) { self.httpServer ? self.httpServer.close() : null; next() },
        function(next) { self.expressServer ? self.expressServer.close() : null; next() },
    ], function(err) {
        cb(err);
    })
}

/*
 * class method to construct a new klog server
 */
KlogServer.createServer = function createServer( options, callback ) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (!options) options = {};

// TODO: only create http and/or qrpc servers if port is specified, ie no default ports
    if (!options.httpPort) options.httpPort = 4244;
    if (!options.qrpcPort) options.qrpcPort = 4245;

    var klog = new KlogServer(options);
    var listeningCount = 0;

    if (klog.httpPort) klog.httpServer = klog.createHttpServer(whenListening);
    if (klog.qrpcPort) klog.qrpcServer = klog.createQrpcServer(whenListening);
    if (klog.expressPort) klog.expressServer = klog.createExpressServer(whenListening);

    // create write/fflush qrpc entry points for the tracked logfiles
    for (var logname in klog.logs) {
        if (klog.qrpcServer) {
            klog.qrpcServer.addHandlerNoResponse(logname + '_write', function(req, res) {
                klog.writeLog(logname, req.m);
            })
            klog.qrpcServer.addHandler(logname + '_fflush', function(req, res, next) {
                var err = klog.fflushLog(logname, next);
                if (err) next(err);
            })
        }
    }

    return klog;

    function whenListening( ) {
        listeningCount += 1;
        if (listeningCount == 2 && callback) callback(null, klog);
    }
}

// construct a restiq http server
KlogServer.prototype.createHttpServer = function createHttpServer( cb ) {
    var self = this;
    var app = restiq.createServer({
        readBinary: true,       // gather req.body into a Buffer
        debug: true,            // return full error in response
    });

    // app.addStep(restiq.mw.parseRouteParams) -- done when route is mapped
    app.addStep(restiq.mw.parseQueryParams);
    app.addStep(restiq.mw.readBody);

    app.addRoute('POST', '/:logname/write', function(req, res, next) { self._doHttpLogWrite(req, res, next) });
    app.addRoute('POST', '/:logname/sync', function(req, res, next) { self._doHttpLogSync(req, res, next) });

    app.listen(this.httpPort, function(err, ret) {
        cb(err, ret);
    });

    return app;
}

// construct an express http server
KlogServer.prototype.createExpressServer = function createExpressServer( cb ) {
    var self = this;
    var app = express();

    // read in body.  There is no middleware for this?
    app.use(function(req, res, next) {
        var chunks = new Array();
        req.on('data', function(chunk) {
            // TODO: would be faster to use require('string_decoder') to gather as string,
            // but might want to support binary logs
            chunks.push(chunk)
        })
        req.on('end', function() {
            var data = chunks.length > 1 ? Buffer.concat(chunks) : chunks[0];
            req.body = data;
            next();
        })
    })

    app.post('/:logname/write', function(req, res, next) { self._doHttpLogWrite(req, res, next) });
    app.post('/:logname/sync', function(req, res, next) { self._doHttpLogSync(req, res, next) });

    var server = app.listen(this.expressPort, function(err, ret) {
        cb(err, ret);
    })
    // return a server that can be closed
    return server;
}

KlogServer.prototype._doHttpLogWrite = function _doHttpLogWrite( req, res, next ) {
    var err = this.appendLog(req.params.logname, req.body);
    if (!err) {
        res.end("OK");
        next();
    }
    else {
        res.writeHead(400);
        res.end(err.stack);
        next()
    }
}

KlogServer.prototype._doHttpLogSync = function _doHttpLogSync( req, res, next ) {
    var err = this.syncLog(req.params.logname, function(err) {
        // callback errors are 500 internal errors
        // write errors are delivered from qfputs on fflush()
        if (!err) {
            res.end("OK");
        } else {
            res.writeHead(500);
            res.end(err.stack);
        }
        next();
    });
    if (err) {
        // returned errors are 400 user errors
        res.writeHead(400);
        res.end(err.stack);
        next();
    }
}

KlogServer.prototype.createQrpcServer = function createQrpcServer( cb ) {
    var server = qrpc.createServer();
    var logname = null;
    var nlines = 0;
    var self = this;

    server.addHandlerNoResponse('logname', function(req, res) {
//console.log("AR: logname =", req);
        logname = req.m;
    })

    server.addHandlerNoResponse('write', function(req, res) {
//nlines += 1; console.log("AR: qrpc write to %s: req.m", logname, req.m);
        self.appendLog(logname, req.m);
    })

    server.addHandler('sync', function(req, res, next) {
//console.log("AR: qrpc sync", nlines); nlines = 0;
        var err = self.syncLog(logname, next);
        if (err) next(err);
    })

    server.listen(this.qrpcPort, function(err, ret) {
        cb(err, ret);
    });
    return server;
}

KlogServer.prototype.appendLog = function appendLog( logname, body ) {
    var log = this.logs[logname];
    if (!log) return new Error(logname + ": log not configured");

    // skip emtpy loglines
    if (body == null) return;
    if (!body.length) body = String(body);
    if (body.length === 0) return;

    // guarantee newline termination
    if (typeof body === 'string') {
        if (body[body.length - 1] !== '\n') {
            body += '\n';
        }
    } else {
        if (body[body.length - 1] !== '\n'.charCodeAt(0)) {
            var body2 = new Buffer(body.length + 1);
            body.copy(body2);
            body2[body2.length - 1] = '\n'.charCodeAt(0);
            body = body2;
        }
    }
    log.write(body);
}

KlogServer.prototype.syncLog = function syncLog( logname, cb ) {
    var log = this.logs[logname];

    // returned errors are 400 user errors
    if (!log) return new Error("no such log");

    // callback errors are 500 internal errors
    log.fflush(cb);
}
