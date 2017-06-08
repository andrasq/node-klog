'use strict';

module.exports = createServer;

var express = require('express');
var restiq = require('restiq');
var qrpc = require('qrpc');

function createServer( options, callback ) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (!options) options = {};
    var httpPort = options.httpPort || 4244;
    var qrpcPort = options.qrpcPort || 4245;

    var listeningCount = 0;
    var klog = {
        httpPort: httpPort,
        qrpcPort: qrpcPort,
        logs: options.logs || {},
        httpServer: null,
        qrpcServer: null,
        _closed: false,
        close: function close(cb) {
            klog.httpServer.close(function(){
                if (klog._closed) return cb();
                klog._closed = true;
                klog.qrpcServer.close(cb);
            });
        }
    };

    klog.httpServer = createHttpServer(klog, whenListening);
    //klog.httpServer = createExpressServer(klog, whenListening);
    klog.qrpcServer = createQrpcServer(klog, whenListening);

    return klog;

    function whenListening( ) {
        listeningCount += 1;
        if (listeningCount == 2 && callback) callback(null, klog);
    }
}

function createHttpServer( klog, cb ) {
    var app = restiq.createServer();

    // app.addStep(restiq.mw.parseRouteParams) -- done when route is mapped
    app.addStep(restiq.mw.parseQueryParams);
    app.addStep(restiq.mw.readBody);

    app.addRoute('POST', '/:logname/write', function(req, res, next) {
console.log("AR: restiq call", req.params, req.body);
        var err = appendLog(klog, req.params.logname, req.body);
        if (!err) {
            res.end("OK");
            next();
        }
        else {
            res.writeHead(400);
            res.end(err.message);
            next()
        }
    })

    app.listen(klog.httpPort, function(err, ret) {
        cb(err, ret);
    });

    return app;
}

function createExpressServer( klog, cb ) {
    var app = express();

// FIXME: read in body!  else sees an empty string?? (not undefined)

    app.post('/:logname/write', function(req, res, next) {
console.log("AR: express call", req.params);
        var err = appendLog(klog, req.params.logname, req.body);
console.log("AR: express got err", err);
        if (!err) {
            res.end("OK");
            next();
        }
        else {
// FIXME: how to set express response status code?
throw err;
            res.statusCode = 400;
            res.end(err.message);
            next()
        }
    })

    app.post('/:logname/sync', function(req, res, next) {
        var err = syncLog(klog, req.params.logname);
    })

    var server = app.listen(klog.httpPort, function(err, ret) {
        cb(err, ret);
    })
    // return a server that can be closed
    return server;
}

function createQrpcServer( klog, cb ) {
    var server = qrpc.createServer();

    server.addHandler('write', function(req, res, next) {
        // ...
    })

    server.listen(klog.qrpcPort, function(err, ret) {
        cb(err, ret);
    });
    return server;
}

function appendLog( klog, logname, body ) {
    var log = klog.logs[logname];
console.log("AR: log is", log);

console.log("AR: MARK", body, body.length)
    // skip emtpy loglines
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
        }
    }
console.log("AR: log is", log);
    if (!log) return new Error(logname + ": log not configured");
    log.write(body);
}

function syncLog( klog, logname ) {
// WRITEME
}
