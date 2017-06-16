'use strict';

module.exports = KlogServer;

var aflow = require('aflow');
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
    if (this.closed) return cb ? cb() : null;
    this.closed = true;
    aflow.series([
        function(next) { self.qrpcServer ? self.qrpcServer.close(next) : next() },
        function(next) { self.httpServer ? self.httpServer.close() : null; next() },
        function(next) { self.expressServer ? self.expressServer.close() : null; next() },
    ], function(err) {
        if (cb) cb(err);
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
                var err = klog.writeLog(logname, req.m);
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
        var expectListeningCount = 0;
        if (klog.httpPort) expectListeningCount += 1;
        if (klog.qrpcPort) expectListeningCount += 1;
        if (klog.expressPort) expectListeningCount += 1;
        if (listeningCount == expectListeningCount && callback) callback(null, klog);
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
    app.addRoute('POST', '/:logname/fflush', function(req, res, next) { self._doHttpLogSync(req, res, next) });

    app.listen(this.httpPort, function(err, ret) {
        cb(err, ret);
    });

    return app;
}

// construct an express http server
// only used for benchmarking, express is not a dependency
KlogServer.prototype.createExpressServer = function createExpressServer( cb ) {
    var express = require('express');
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
    app.post('/:logname/fflush', function(req, res, next) { self._doHttpLogSync(req, res, next) });

    var server = app.listen(this.expressPort, function(err, ret) {
        cb(err, ret);
    })
    // return a server that can be closed
    return server;
}

KlogServer.prototype._doHttpLogWrite = function _doHttpLogWrite( req, res, next ) {
    var err = this.writeLog(req.params.logname, req.body);
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
    var err = this.fflushLog(req.params.logname, function(err) {
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

KlogServer.prototype.createQrpcServer = function createQrpcServer( callback ) {
    var self = this;
    var server = qrpc.createServer(function(socket) {
        // on every connection, make sure that responses are not delayed
        socket.setNoDelay(true);
    });

    // logname_write and logname_fflush endpoints added by createServer

    server.listen(this.qrpcPort, function(err, ret) {
        if (callback) callback(err, ret);
    });

    return server;
}

KlogServer.prototype.writeLog = function writeLog( logname, body ) {
    var log = this.logs[logname];
    if (!log) return new Error(logname + ": log not configured");

    // skip emtpy loglines
    if (body == null) return;
    if (!body.length) body = String(body);
    if (body.length === 0) return;

    // the server does not mandate newline termination,
    // to make it usable for any content type
    log.write(body);
}

KlogServer.prototype.fflushLog = function fflushLog( logname, cb ) {
    var log = this.logs[logname];

    // returned errors are 400 user errors
    if (!log) return new Error(logname + ": log not configured");

    // callback errors are 500 internal errors
    log.fflush(cb);
}
