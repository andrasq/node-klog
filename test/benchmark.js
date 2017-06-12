var aflow = require('aflow');

var fs = require('fs');
var request = require('request');
var http = require('http');
var httpAgent = new http.Agent({ keepAlive: true, maxSockets: 40 });
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

//var cluster = { isMaster: true, isWorker: true };
var cluster = require('cluster');
if (cluster.isMaster) {
    if (!cluster.isWorker) cluster.fork();

    var server = klog.createServer({
        httpPort: 4244,
        qrpcPort: 4245,
        expressPort: 4246,

        logs: {
            'testlog': {
                write: function(){},
                fflush: function(cb) { cb() },
            },
            //'testlog': new Fputs(new Fputs.FileWriter("testlog.log", "a")),
            //'testlog': new Fputs(fs.createWriteStream("testlog.log", {highWaterMark: 409600, flags: "a"})),
            'quit': {
                fflush: function(cb) { server.close(cb) },
            },
        },
    }, function(err, svr) {
        // server listening
    });
}
if (cluster.isWorker) {

    var client = qrpc.connect(4245, 'localhost', function(socket) {
        socket.setNoDelay(true);
        client.call('logname', 'testlog');
    });

    var klogClient = klog.createClient('testlog', { qrpcPort: 4245, host: 'localhost' }, function(c) {
    });

    qtimeit.bench.timeGoal = 0.40;
    qtimeit.bench.opsPerTest = 100;
    qtimeit.bench.visualize = true;
    qtimeit.bench.showRunDetails = false;
    setTimeout(function(){ qtimeit.bench({
/**
        'qrpc.connect': function(done) {
            var client = qrpc.connect(4245, 'localhost', function(socket) {
                client.close();
                done();
            })
            // 13k/s
        },
**/

/**
        'new klogClient': function(done) {
            klog.createClient('testlog', function(err, client) {
                client.close();
                done();
            })
            // 12k/s
        },
**/

        'express w request 1': function(done) {
            log_100_w_express_request(done);
        },

        'express w request 2': function(done) {
            log_100_w_express_request(done);
        },

        'express w request 3': function(done) {
            log_100_w_express_request(done);
            // 7.2 k/s
        },

        'express w qhttp 1': function(done) {
            log_100_w_express_qhttp(done);
        },

        'express w qhttp 2': function(done) {
            log_100_w_express_qhttp(done);
        },

        'express w qhttp 3': function(done) {
            log_100_w_express_qhttp(done);
            // 14.8 k/s
        },

        'restiq w qhttp 1': function(done) {
            log_100_w_restiq_qhttp(done);
        },

        'restiq w qhttp 2': function(done) {
            log_100_w_restiq_qhttp(done);
        },

        'restiq w qhttp 3': function(done) {
            log_100_w_restiq_qhttp(done);
            // 15.8 k/s
        },

        'restiq w request 1': function(done) {
            log_100_w_restiq_request(done);
        },

        'restiq w request 2': function(done) {
            log_100_w_restiq_request(done);
        },

        'restiq w request 3': function(done) {
            log_100_w_restiq_request(done);
            // 7.8 k/s
        },

        'qrpc w qrpc 1': function(done) {
            log_100_w_qrpc_qrpc(client, done);
        },
        'qrpc w qrpc 2': function(done) {
            log_100_w_qrpc_qrpc(client, done);
        },
        'qrpc w qrpc 3': function(done) {
            log_100_w_qrpc_qrpc(client, done);
            // 31 k/s
        },

        'qrpc w qrpc 1k x10 1': function(done) {
            log_1000_w_qrpc_qrpc(client, done);
        },
        'qrpc w qrpc 1k x10 2': function(done) {
            log_1000_w_qrpc_qrpc(client, done);
        },
        'qrpc w qrpc 1k x10 3': function(done) {
            log_1000_w_qrpc_qrpc(client, done);
            // 134 k/s
        },

        'qrpc w klogClient 1': function(done) {
            log_100_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 2': function(done) {
            log_100_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 3': function(done) {
            log_100_w_qrpc_klogClient(klogClient, done);
            // 31 k/s
        },

        'qrpc w klogClient 100k x1000 stream 1': function(done) {
// FIXME: if running for 2.0 sec works, but for 0.5 sec errors out with
// RangeError: Maximum call stack size exceeded at qtimeit/timeit.js:579:36
            log_100k_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 100k x1000 stream 2': function(done) {
            log_100k_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 100k x1000 stream 3': function(done) {
            log_100k_w_qrpc_klogClient(klogClient, done);
            // 250 k/s 100k, 190 k/s 10k, 140 k/s 1k lines per sync
        },

        'qrpc w klogClient 10k x100 stream 1': function(done) {
            log_10k_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 10k x100 stream 2': function(done) {
            log_10k_w_qrpc_klogClient(klogClient, done);
        },
        'qrpc w klogClient 10k x100 stream 3': function(done) {
            log_10k_w_qrpc_klogClient(klogClient, done);
            // 250 k/s 100k, 190 k/s 10k, 140 k/s 1k lines per sync
        },

        'qrpc w klogClient pump 1': function(done) {
            log_100k_w_qrpc_klogClient_pump(klogClient, done);
        },
        'qrpc w klogClient pump 2': function(done) {
            log_100k_w_qrpc_klogClient_pump(klogClient, done);
        },
        'qrpc w klogClient pump 3': function(done) {
            log_100k_w_qrpc_klogClient_pump(klogClient, done);
        },
        //'flush': function(done) {
        //    klogClient.fflush(done);
        //},

    }, function(err) {

    var client = qrpc.connect(4245, 'localhost', function(socket) {
        // for logging we need to turn off the Nagle algorithm, else only does 40 syncs per second
        socket.setNoDelay();

        aflow.series([
            function(next) {
                // wait for server to be created
                setTimeout(next, 100);
            },

            function(next) {
                console.log("");
                console.log("qrpc with qrpc");
                console.time('qrpc');
// TODO: use klog-client to make calls
                client.call('logname', 'testlog');
                for (var i=0; i<10000; i++) {
                    client.call('write', loglines[i]);
                }
                client.call('sync', function(err, ret) {
                    console.timeEnd('qrpc');
                    next();
                })
            },

            function(next) {
                console.log("");
                console.log("qrpc with qrpc");
                console.time('qrpc');
// TODO: use klog-client to make calls
                client.call('logname', 'testlog');
                for (var i=0; i<10000; i++) {
                    client.call('write', loglines[i]);
                }
                client.call('sync', function(err, ret) {
                    console.timeEnd('qrpc');
                    next();
                })
            },

            function(next) {
                console.log("");
                console.log("qrpc with qrpc");
                console.time('qrpc');
// TODO: use klog-client to make calls
                client.call('logname', 'testlog');
                var ncalls = 0;
                aflow.repeatWhile(
                    function(){ return ncalls < 10000 },
                    function(done) {
                        for (var i=0; i<1000; i++) client.call('write', loglines[ncalls + i]);
                        ncalls += i;
                        client.call('sync', done);
                    },
                    function(err) {
                        console.timeEnd('qrpc');
                        next();
                    }
                );
            },

        ],
        function(err) {
            if (err) throw err;
            qhttp.post("http://localhost:4244/quit/sync", function(err, res, body) {
                console.log("AR: Done.");
                client.close()
// FIXME: something isnt closed, keeps program resident...
            })
        });

    })

    })
    }, 250);
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
            request.post("http://localhost:4246/testlog/sync", function(err, res) {
// FIXME: RangeError: Maximum call stack size exceeded in qtimeit ?!
// works @ 100
// ... could not reproduce
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
            qhttp.post("http://localhost:4246/testlog/sync", done);
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
            qhttp.post("http://localhost:4244/testlog/sync", done);
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
            request.post("http://localhost:4244/testlog/sync", done);
        }
    }
}

function log_100_w_qrpc_qrpc( client, done ) {
    for (var i=0; i<100; i++) {
        client.call('write', loglines[i]);
    }
    client.call('sync', function(err, ret) {
        done();
    })
}

function log_1000_w_qrpc_qrpc( client, done ) {
    for (var i=0; i<1000; i++) {
        client.call('write', loglines[i]);
    }
    client.call('sync', function(err, ret) {
        done();
    })
}

function log_100_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100; i++) {
        klogClient.write(loglines[i]);
    }
    client.call('sync', function(err, ret) {
        done();
    })
}

function log_100k_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<100000; i++) {
        klogClient.write(loglines[i]);
    }
    klogClient.fflush(done);
}

function log_10k_w_qrpc_klogClient( klogClient, done ) {
    for (var i=0; i<10000; i++) {
        klogClient.write(loglines[i]);
    }
    klogClient.fflush(done);
}

function log_100k_w_qrpc_klogClient_pump( klogClient, done ) {
    for (var i=0; i<1000; i++) {
        klogClient.write(loglines[i]);
    }
    done();
}
