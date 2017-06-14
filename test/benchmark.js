if (process.argv[1].slice(-4) === 'qnit') return;

var aflow = require('aflow');

var fs = require('fs');
var request = require('request');
var http = require('http');
var httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
var Url = require('url');
var qhttp = require('qhttp');
var Fputs = require('qfputs');
var qprintf = require('qprintf');
var qrpc = require('qrpc');
var qtimeit = require('qtimeit');

var klog = require('../');

var x190 = "x".repeat(190);
var loglines = new Array();
for (var i=0; i<10000; i++) loglines.push(qprintf.sprintf("%s%09d\n", x190, i));

var z190 = "z".repeat(190);
var z_id = 0;
function makeLogline( ) {
    var line = qprintf.sprintf("%s%09d\n", z190, ++z_id);
    return line;
}

//var cluster = { isMaster: true, isWorker: true };
var cluster = require('cluster');
if (cluster.isMaster) {
    if (!cluster.isWorker) cluster.fork();

    var testlogStream = fs.createWriteStream("testlog.log", {highWaterMark: 409600, flags: "a"});
    var testlogQfputs = new Fputs(new Fputs.FileWriter("testlog.log", "a"));

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
            'testlog': testlogQfputs,
        },
    };

    klog.createServer(serverConfig, function(err, server) {
        // server listening
        // add a hook so the tests can close the server
        if (server.qrpcServer) server.qrpcServer.addHandler('quit', function(req, res, next) {
console.log("AR: quit server (qrpc), linesReceived=%d", linesReceived);
            server.close(next);
        })
        if (server.qrpcServer) server.qrpcServer.addHandler('linesReceived', function(req, res, next) {
            next(null, linesReceived);
        })
        if (server.httpServer) server.httpServer.addRoute('/quit', function(req, res, next) {
console.log("AR: quit server (http)");
            server.close(function(err) {
                next(err, linesReceived);
            });
        })
    });
}

if (cluster.isWorker) {
    var client, klogClient;

    var linesSent = 0;

    qtimeit.bench.visualize = true;
    qtimeit.bench.showTestInfo = true;
    qtimeit.bench.showRunDetails = false;

    aflow.series([

    function(next) {
        client = qrpc.connect(4245, 'localhost', function(socket) {
            socket.setNoDelay(true);
            next();
        })
    },

    function(next) {
        klogClient = klog.createClient('testlog', { qrpcPort: 4245, host: 'localhost' }, function(c) {
            next();
        });
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
//        return next();

        console.log("");
        qtimeit.bench.timeGoal = 10;
        qtimeit.bench.opsPerTest = 100;
        qtimeit.bench.baselineAvg = 20000;

        qtimeit.bench({

        'express w request 1': function(done) { log_100_w_express_request(done) },
        'express w request 2': function(done) { log_100_w_express_request(done) },
        'express w request 3': function(done) { log_100_w_express_request(done) },
        // 7.6k/s relayed, 7.2 k/s written and flushed

        'restiq w request 1': function(done) { log_100_w_restiq_request(done) },
        'restiq w request 2': function(done) { log_100_w_restiq_request(done) },
        'restiq w request 3': function(done) { log_100_w_restiq_request(done) },
        // 7.8 k/s

        'express w qhttp 1': function(done) { log_100_w_express_qhttp(done) },
        'express w qhttp 2': function(done) { log_100_w_express_qhttp(done) },
        'express w qhttp 3': function(done) { log_100_w_express_qhttp(done) },
        // 17k/s relayed, 12.8 k/s written

        'restiq w qhttp 1': function(done) { log_100_w_restiq_qhttp(done) },
        'restiq w qhttp 2': function(done) { log_100_w_restiq_qhttp(done) },
        'restiq w qhttp 3': function(done) { log_100_w_restiq_qhttp(done) },
        // 20k/s relayed, 14.8 k/s written

        'qrpc w qrpc 1': function(done) { log_100_w_qrpc_qrpc(client, done) },
        'qrpc w qrpc 2': function(done) { log_100_w_qrpc_qrpc(client, done) },
        'qrpc w qrpc 3': function(done) { log_100_w_qrpc_qrpc(client, done) },
        // 182k/s relayed, 31k/s written

        'qrpc w klogClient 1': function(done) { log_100_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 2': function(done) { log_100_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 3': function(done) { log_100_w_qrpc_klogClient(klogClient, done) },
        // 183k/s relayed, 31 k/s written

        'qrpc w klogClient 1k 1': function(done) { log_1000_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 1k 2': function(done) { log_1000_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 1k 3': function(done) { log_1000_w_qrpc_klogClient(klogClient, done) },
        // 192k/s relayed, 142k/s written

        'qrpc w klogClient 10k 1': function(done) { log_10k_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 10k 2': function(done) { log_10k_w_qrpc_klogClient(klogClient, done) },
        'qrpc w klogClient 10k 3': function(done) { log_10k_w_qrpc_klogClient(klogClient, done) },
        // 192k/s relayed, 194k/s written (250k/s 100k ea)

        }, next);
    },

    function(next) {
        return next();

        console.log("");
        qtimeit.bench.timeGoal = 0.40;
        qtimeit.bench.opsPerTest = 100;
        qtimeit.bench({

        'qrpc w qrpc obj 1': function(done) { log_100_w_qrpc_qrpc_obj(client, done) },
        'qrpc w qrpc obj 2': function(done) { log_100_w_qrpc_qrpc_obj(client, done) },
        'qrpc w qrpc obj 3': function(done) { log_100_w_qrpc_qrpc_obj(client, done) },
        // 172k/s relayed

        'qrpc w qrpc 1k 1': function(done) { log_1000_w_qrpc_qrpc(client, done) },
        'qrpc w qrpc 1k 2': function(done) { log_1000_w_qrpc_qrpc(client, done) },
        'qrpc w qrpc 1k 3': function(done) { log_1000_w_qrpc_qrpc(client, done) },
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
        klogClient = klog.createClient('testlog', {
            qrpcPort: 4245,
            host: 'localhost',
            journal: 'testlog.jour',
        }, next);
    },

    function(next) {
//        return next();

        console.log("");
        console.log("2m log lines");
        z_id = 0;
        console.time('2m lines');
        aflow.repeatUntil(function(done) {
            klogClient.write(makeLogline());
            done(null, z_id >= 2e6);
        }, function(err) {
            if (err) return next(err);
            klogClient.fflush(function(err) {
                console.timeEnd('2m lines');
                klogClient.call('linesReceived', function(err, linesReceived) {
                    console.log("AR: sent / received", z_id, linesReceived);
                    next(err);
                })
            })
        })
        // 490 k/s sent to klog server (460k/s for 4m lines)
        // 414 k/s lines synced to klog server target logfile (320k/s for 4m lines)
    },

    function(next) {
        return next();

        console.log("");
        qtimeit.bench.timeGoal = 0.60;
        qtimeit.bench.opsPerTest = 100;
        qtimeit.bench.showRunDetails = true;

        qtimeit.bench({

        'qrpc w klogClient journaled 1': function(done) { log_100_w_qrpc_klogClient_pump(klogClient, done) },
        'qrpc w klogClient journaled 2': function(done) { log_100_w_qrpc_klogClient_pump(klogClient, done) },
        'qrpc w klogClient journaled 3': function(done) { log_100_w_qrpc_klogClient_pump(klogClient, done) },
        //

        }, next)
        // 480 k/s lines sent to klog server
        // 370 k/s lines synced to klog server target logfile
    },

    function(next) {
        linesSent = z_id;
// FIXME: some lines not flushed to log ??
client.call('linesReceived', function(err, linesReceived) {
            console.log("AR: lines sent, received", linesSent, linesReceived);
            next();
        })
    },

    function(next) {
        client.call('linesReceived', function(err, linesReceived) {
            console.log("AR: before final flush, lines sent %d, lines logged %d", linesSent, linesReceived, err);
            console.time('fflush');
            klogClient.fflush(function(err) {
                console.timeEnd('fflush');
                client.call('linesReceived', function(err, linesReceived) {
                    console.log("AR: after final flush, lines sent %d, lines logged %d", linesSent, linesReceived, err);
                    next(err);
                })
            })
        })
    },

    function(next) {
        client.call('linesReceived', function(err, linesReceived) {
            console.log("AR: before post-final flush, lines sent", err, linesSent, linesReceived);
            console.time('fflush');
            klogClient.fflush(function(err) {
                console.timeEnd('fflush');
                client.call('linesReceived', function(err, linesReceived) {
                    console.log("AR: after post-final flush, lines sent", err, linesSent, linesReceived);
                    next(err);
                })
            })
        })
    },

    function(next) {

        client.call('testlog_fflush', function(err) {
            klogClient.fflush(function(err) {
                klogClient.call('quit', function(err, linesReceived) {
                    console.log("AR: total lines sent", err, linesReceived);
                    client.close(function(){
                        klogClient.close();
                        console.log("AR: Done.");
// force the client to exit, this causes the parent to exit too
// TODO: worker should exit when the clients are closed
setTimeout(process.exit, 1000);
                    })
                })
            })
        })
    },

    ],
    function(err) {
// /* NOTREACHED */
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

function log_100_w_qrpc_qrpc( client, done ) {
    for (var i=0; i<100; i++) {
        client.call('testlog_write', loglines[i]);
    }
    client.call('testlog_fflush', function(err, ret) {
        done();
    })
}

function log_100_w_qrpc_qrpc_obj( client, done ) {
    for (var i=0; i<100; i++) {
        client.call('testlog_write', { nm: 'testlog', d: loglines[i] });
    }
    client.call('testlog_fflush', function(err, ret) {
        done();
    })
}

function log_1000_w_qrpc_qrpc( client, done ) {
    for (var i=0; i<100; i++) {
        client.call('testlog_write', loglines[i]);
    }
    if (Math.random() <= 0.10) client.call('testlog_fflush', done);
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
