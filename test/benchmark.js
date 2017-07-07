if (process.argv[1].slice(-4) === 'qnit') return;

var aflow = require('aflow');

var fs = require('fs');
try {
    var request = require('request');
} catch (err) {
    console.log("request not installed, using qhttp instead");
    var request = require('qhttp');
}
var http = require('http');
var httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
var Url = require('url');
var qhttp = require('qhttp');
var Fputs = require('qfputs');
var qprintf = require('qprintf');
var qrpc = require('qrpc');
var qtimeit = require('qtimeit');

var klog = require('../');

var x190 = new Array(190+1).join("x");
var loglines = new Array();
for (var i=0; i<10000; i++) loglines.push(qprintf.sprintf("%s%09d\n", x190, i));

var z190 = new Array(190 + 1).join("z");
var z_id = 0;
function makeLogline( ) {
    var line = qprintf.sprintf("%s%09d\n", z190, ++z_id);
    return line;
}

//var cluster = { isMaster: true, isWorker: true };
var cluster = require('cluster');
if (cluster.isMaster) {
    if (!cluster.isWorker) cluster.fork();

    cluster.disconnect();

    var outputFile = "testlog.log";
    var testlogStream = fs.createWriteStream(outputFile, {highWaterMark: 409600, flags: "a"});
    var testlogQfputs = new Fputs(new Fputs.FileWriter(outputFile));

    var linesReceived = 0;

    var serverConfig = {
        httpPort: 4244,
        qrpcPort: 4245,
        expressPort: 4246,

        logs: {
            // deliver-only (no write) log
            'testlog': {
                write: function(str){
                    if (str instanceof Buffer) {
                        for (var i=0; i<str.length; i++) if (str[i] === 10) linesReceived += 1;
                    }
                    else {
                        for (var i=0; i<str.length; i++) if (str.charCodeAt(i) === 10) linesReceived += 1;
                    }
                },
                fflush: function(cb) {
                    cb();
                },
            },

            // streaming log writer, not mutexed
//            'testlog': {
//                write: function(str) {
//console.log("AR: append to testlog %d B", str.length);
//testlogStream.write(str) },
//                fflush: function(cb) { testlogStream.write("", cb) },
//            },

            // mutexed log writer
//            'testlog': testlogQfputs,
        },
    };

    klog.createServer(serverConfig, function(err, server) {
        // server listening
        // add a hook so the tests can close the server
        if (server.qrpcServer) server.qrpcServer.addHandler('quit', function(req, res, next) {
console.log("AR: quit server (qrpc), %d lines received", linesReceived);
            server.close(next);
        })
        if (server.qrpcServer) server.qrpcServer.addHandler('linesReceived', function(req, res, next) {
            next(null, linesReceived);
        })
        if (server.qrpcServer) server.qrpcServer.addHandler('testlog_writeAck', function(req, res, next) {
            server.writeLog('testlog', req.m);
            next();
        })
        if (server.httpServer) server.httpServer.addRoute('/quit', function(req, res, next) {
console.log("AR: quit server (http), %d lines received", linesReceived);
            server.close(function(err) {
                next(err, linesReceived);
            });
        })
    });
}

if (cluster.isWorker) {
    var client, klogClient, journaledClient;

    var linesSent = 0;

    qtimeit.bench.visualize = true;
    qtimeit.bench.showTestInfo = true;
    qtimeit.bench.showRunDetails = false;
    qtimeit.bench.bargraphScale = 2.5;

    aflow.series([

    function(next) {
        qrpcClient = qrpc.connect(4245, 'localhost', function(socket) {
            socket.setNoDelay(true);
            next();
        })
    },

    function(next) {
        klogClient = klog.createClient('testlog', { port: 4245, host: 'localhost' }, function(c) {
            next();
        });
    },

    function(next) {
        journaledClient = klog.createClient('testlog', {
            port: 4245,
            host: 'localhost',
            journal: 'testlog.jrn',
        }, next);
    },

    function(next) {
        // note: this test chews up free sockets, omit
        return next();

        console.log("");
        qtimeit.bench.timeGoal = 0.4;
        qtimeit.bench({
        'qrpc.connect': function(done) {
            var client3 = qrpc.connect(4245, 'localhost', function(socket) {
                client3.close();
                done();
            })
            // 13k/s
        },
        'new klogClient': function(done) {
            klog.createClient('testlog', function(err, client) {
                client.close();
                done();
            })
            // 12k/s
        },
        }, next)
    },

    function(next) {
//return next();

        console.log("");
        qtimeit.bench.timeGoal = 1;
        qtimeit.bench.opsPerTest = 100;
        //qtimeit.bench.baselineAvg = 20000;

        qtimeit.bench({

        'express w request 1': function(done) { log_100_w_express_request(done) },
        'express w request 2': function(done) { log_100_w_express_request(done) },
        // 7.6k/s relayed, 7.2 k/s written and flushed

        'express w request chained 1': function(done) { log_100_w_express_request_chained(done) },
        'express w request chained 2': function(done) { log_100_w_express_request_chained(done) },
        // 4k/s

        // 'restiq w request 1': function(done) { log_100_w_restiq_request(done) },
        // 7.8 k/s

        'express w qhttp 1': function(done) { log_100_w_express_qhttp(done) },
        'express w qhttp 2': function(done) { log_100_w_express_qhttp(done) },
        // 17k/s relayed, 12.8 k/s written

        'restiq w qhttp 1': function(done) { log_100_w_restiq_qhttp(done) },
        'restiq w qhttp 2': function(done) { log_100_w_restiq_qhttp(done) },
        // 20k/s relayed, 14.8 k/s written (8k/s on aws vm)

        'restiq w qhttp chained 1': function(done) { log_100_w_restiq_qhttp_chained(done) },
        'restiq w qhttp chained 2': function(done) { log_100_w_restiq_qhttp_chained(done) },
        // 10k/s

        'qrpc w ack 1': function(done) { log_100_w_qrpc_ack(done) },
        'qrpc w ack 2': function(done) { log_100_w_qrpc_ack(done) },
        // 110k/s, 30k/s written (26k/s on aws vm)

        'qrpc chained 1': function(done) { log_100_w_qrpc_chained(done) },
        'qrpc chained 2': function(done) { log_100_w_qrpc_chained(done) },
        // 31k/s

        // 'qrpc w qrpc 1': function(done) { log_100_w_qrpc_qrpc(qrpcClient, done) },
        // 182k/s relayed, 31k/s written

        'qrpc w klogClient 1': function(done) { log_100_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 2': function(done) { log_100_w_qrpc_klogClient(klogClient, done) },
        // 183k/s relayed, 31 k/s written

        'qrpc w klogClient 1k 1': function(done) { log_1000_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 1k 2': function(done) { log_1000_w_qrpc_klogClient(klogClient, done) },
        // 192k/s relayed, 142k/s written

        'qrpc w klogClient 10k 1': function(done) { log_10k_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 10k 2': function(done) { log_10k_w_qrpc_klogClient(klogClient, done) },
        // 192k/s relayed, 194k/s written (250k/s 100k ea)

        }, next);
    },

    function(next) {
return next();

        console.log("");
        qtimeit.bench.timeGoal = 0.40;
        qtimeit.bench.opsPerTest = 100;
        qtimeit.bench({

        'qrpc w qrpc obj 1': function(done) { log_100_w_qrpc_qrpc_obj(qrpcClient, done) },
        'qrpc w qrpc obj 2': function(done) { log_100_w_qrpc_qrpc_obj(qrpcClient, done) },
        'qrpc w qrpc obj 3': function(done) { log_100_w_qrpc_qrpc_obj(qrpcClient, done) },
        // 172k/s relayed

        'qrpc w qrpc 1k 1': function(done) { log_1000_w_qrpc_qrpc(qrpcClient, done) },
        'qrpc w qrpc 1k 2': function(done) { log_1000_w_qrpc_qrpc(qrpcClient, done) },
        'qrpc w qrpc 1k 3': function(done) { log_1000_w_qrpc_qrpc(qrpcClient, done) },
        // 134 k/s

        'qrpc w klogClient 100k 1': function(done) { log_100k_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 100k 2': function(done) { log_100k_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 100k 3': function(done) { log_100k_w_qrpc_klogClient(klogClient, done) },
        // 250 k/s 100k, 190 k/s 10k, 140 k/s 1k lines per sync

        'qrpc w klogClient pump 1': function(done) { log_100k_w_qrpc_klogClient_pump(klogClient, done) },
        'qrpc w klogClient pump 2': function(done) { log_100k_w_qrpc_klogClient_pump(klogClient, done) },
        'qrpc w klogClient pump 3': function(done) { log_100k_w_qrpc_klogClient_pump(klogClient, done) },

        }, next)
    },

    function(next) {
        klogClient.close();
        klogClient = klog.createClient('testlog', {
            port: 4245,
            host: 'localhost',
            journal: 'testlog.jour',
        }, next);
    },

    function(next) {
return next();

        console.log("");
        console.log("2m log lines");
        z_id = 0;
        console.time('2m lines');
        console.time('2m lines f2');
        aflow.repeatUntil(function(done) {
            journaledClient.write(makeLogline());
            done(null, z_id >= 2e6);
        },
        function(err) {
            if (err) return next(err);
            journaledClient.fflush(function(err) {
                if (err) return next(err);
                console.timeEnd('2m lines');
                journaledClient.fflush(function(err) {
                    console.timeEnd('2m lines f2');
                    next(err);
                })
            })
        })
        // 490 k/s sent to klog server (460k/s for 4m lines)
        // 414 k/s lines synced to klog server target logfile (320k/s for 4m lines)
        // 530 k/s synced if only 1m lines
    },

    function(next) {
return next();

        var nloops = 1000;
        console.log("");
        qtimeit.bench.timeGoal = 0.60;
        qtimeit.bench.opsPerTest = nloops;
        qtimeit.bench.showRunDetails = true;

        qtimeit.bench({

        'qrpc w journaledClient journaled 1': function(done) { log_N_w_qrpc_klogClient(journaledClient, nloops, 1, done) },
        'qrpc w journaledClient journaled 2': function(done) { log_N_w_qrpc_klogClient(journaledClient, nloops, 1, done) },
        'qrpc w journaledClient journaled 3': function(done) { log_N_w_qrpc_klogClient(journaledClient, nloops, 1, done) },

        }, function(err) {
            next(err);
        })
        // pump, no sync:
        // 480 k/s lines sent to klog server
        // 370 k/s lines synced to klog server target logfile
        // pump, sync every 1000:
        // 217k/s synced to file (1k), 244k/s (100), 200k/s (10k)
    },

    function(next) {
        if (!qrpcClient) return next();
        qrpcClient.call('testlog_fflush', function(err) {
            qrpcClient.close(next);
        })
    },

    function(next) {
        console.time("journal fflush");
        journaledClient.fflush(function(err) {
            console.timeEnd("journal fflush");
            journaledClient.close(next);
        })
    },

    function(next) {
        console.log("AR: before final fflush, %d lines sent", linesSent);
        console.time('fflush');
        klogClient.fflush(function(err) {
            console.timeEnd('fflush');
            next(err);
        })
    },

    function(next) {
        // use klogClient to also shut down the server
        // all network listeners must be closed for node to exit cleanly
        klogClient.call('quit', function(err, linesReceived) {
            console.log("AR: total lines received", err, linesReceived);
            klogClient.close(function(){
                next(err);
            })
        })
    },

    ],
    function(err) {
        console.log("AR: Done.");
    });
}

function log_100_w_express_request( done ) {
    var nloops = 100;
    var ndone = 0;

    for (var i=0; i<nloops; i++) {
        var uri = {
            url: "http://localhost:4246/testlog/write",
            body: loglines[i],
            agent: httpAgent,
        };
        request.post(uri, whenDone);
    }

    function whenDone(err, res, body) {
        ndone += 1;
        if (ndone === nloops) {
            request.post("http://localhost:4246/testlog/fflush", function(err, res) {
                done();
            })
        }
    }
}

function log_100_w_express_request_chained( done ) {
    var nloops = 100;
    var ndone = 0;

    aflow.repeatUntil(function(next) {
        if (ndone >= nloops) return next(null, true);
        var uri = {
            url: "http://localhost:4246/testlog/write",
            body: loglines[ndone++],
            agent: httpAgent,
        };
        request.post(uri, function() { next() });
    }, whenDone)

    function whenDone() {
        request.post("http://localhost:4246/testlog/fflush", done);
    }
}

function log_100_w_express_qhttp( done ) {
    var nloops = 100;
    var ndone = 0;

    for (var i=0; i<nloops; i++) {
        var uri = {
            url: "http://localhost:4246/testlog/write",
            body: loglines[i],
            agent: httpAgent,
        };
        qhttp.post(uri, whenDone);
    }

    function whenDone(err, res, body) {
        ndone += 1;
        if (ndone === nloops) {
            qhttp.post("http://localhost:4246/testlog/fflush", done);
        }
    }
}

function log_100_w_restiq_qhttp( done ) {
    var nloops = 100;
    var ndone = 0;

    for (var i=0; i<nloops; i++) {
        var uri = {
            url: "http://localhost:4244/testlog/write",
            body: loglines[i],
            agent: httpAgent,
        };
        qhttp.post(uri, whenDone);
    }

    function whenDone(err, res, body) {
        ndone += 1;
        if (ndone === nloops) {
            qhttp.post("http://localhost:4244/testlog/fflush", done);
        }
    }
}

function log_100_w_restiq_qhttp_chained( done ) {
    var nloops = 100;
    var ndone = 0;

    aflow.repeatUntil(function(next) {
        if (ndone >= 100) return next(null, true);
        var uri = {
            url: "http://localhost:4244/testlog/write",
            body: loglines[ndone++],
            agent: httpAgent,
        };
        qhttp.post(uri, function() { next() });
    }, whenDone)

    function whenDone() {
        qhttp.post("http://localhost:4244/testlog/fflush", done);
    }
}

function log_100_w_restiq_request( done ) {
    var nloops = 100;
    var ndone = 0;

    for (var i=0; i<nloops; i++) {
        var uri = {
            url: "http://localhost:4244/testlog/write",
            body: loglines[i],
            agent: httpAgent,
        };
        request.post(uri, whenDone);
    }

    function whenDone(err, res, body) {
        ndone += 1;
        if (ndone === nloops) {
            request.post("http://localhost:4244/testlog/fflush", done);
        }
    }
}

function log_100_w_qrpc_ack( done ) {
    var nloops = 100;
    var ndone = 0;

    for (var i=0; i<nloops; i++) {
        qrpcClient.call('testlog_writeAck', loglines[i], whenDone);
    }

    function whenDone(err, res, body) {
        ndone += 1;
        if (ndone === nloops) qrpcClient.call('testlog_fflush', done);
    }
}

function log_100_w_qrpc_chained( done ) {
    var nloops = 100;
    var ndone = 0;

    aflow.repeatUntil(function(next) {
        if (ndone >= 100) return next(null, true);
        qrpcClient.call('testlog_writeAck', loglines[ndone++], next);
    }, whenDone)

    function whenDone() {
        qrpcClient.call('fflush', done);
    }
}

function log_100_w_qrpc_qrpc( qrpcClient, done ) {
    for (var i=0; i<100; i++) {
        qrpcClient.call('testlog_write', loglines[i]);
    }
    qrpcClient.call('testlog_fflush', function(err, ret) {
        done();
    })
}

function log_100_w_qrpc_qrpc_obj( qrpcClient, done ) {
    for (var i=0; i<100; i++) {
        qrpcClient.call('testlog_write', { nm: 'testlog', d: loglines[i] });
    }
    qrpcClient.call('testlog_fflush', function(err, ret) {
        done();
    })
}

function log_1000_w_qrpc_qrpc( qrpcClient, done ) {
    for (var i=0; i<100; i++) {
        qrpcClient.call('testlog_write', loglines[i]);
    }
    if (Math.random() <= 0.10) qrpcClient.call('testlog_fflush', done);
    else done();
}

function log_100_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(loglines[i]);
    }
    klogClient.fflush(function(err, ret) {
        done();
    })
}

function log_1000_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(loglines[i]);
    }
    if (Math.random() <= 0.10) klogClient.fflush(done);
    else done();
}

function log_10k_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(loglines[i]);
    }
    if (Math.random() <= 0.01) klogClient.fflush(done);
    else done();
}

function log_100k_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(loglines[i]);
    }
    if (Math.random() <= 0.001) klogClient.fflush(done);
    else done();
}

function log_100_w_qrpc_klogClient_pump( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(makeLogline());
    }
    setImmediate(done);
}

function log_N_w_qrpc_klogClient( klogClient, n, pflush, done ) {
    for (var i=0; i<n; i++) {
        klogClient.write(makeLogline());
    }
    if (pflush < 1.0 && Math.random() <= pflush) klogClient.fflush(done);
    else setImmediate(done);
    // note: some lines have not landed yet (still in the fputs queue?),
    // will have to flush again
}
