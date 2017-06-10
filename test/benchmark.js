var aflow = require('aflow');

var fs = require('fs');
var request = require('request');
var http = require('http');
var httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20 });
var Url = require('url');
var qhttp = require('qhttp');
var Fputs = require('qfputs');
var qprintf = require('qprintf');
var qrpc = require('qrpc');

var klog = require('../lib/klog-server');

var x190 = "x".repeat(190);
var loglines = new Array();
for (var i=0; i<10000; i++) loglines.push(qprintf.sprintf("%s%09d\n", x190, i));

var cluster = require('cluster');
if (cluster.isMaster) {
    cluster.fork();

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
            'testlog': new Fputs(fs.createWriteStream("testlog.log", {highWaterMark: 409600, flags: "a"})),
            'quit': {
                fflush: function(cb) { server.close(cb) },
            },
        },
    });
}
else {

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
                console.log("express with request");
                console.time('express');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4246/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    request.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            request.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('express');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("express with request");
                console.time('express');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4246/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    request.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            request.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('express');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with request");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    request.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            request.post("http://localhost:4244/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with request");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    request.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            request.post("http://localhost:4244/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with qhttp");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4244/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with qhttp");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4244/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

    ///**

            function(next) {
                console.log("");
                console.log("express with qhttp");
                console.time('express');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        method: 'POST',
                        url: "http://localhost:4246/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('express');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("express with qhttp");
                console.time('express');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        method: 'POST',
                        url: "http://localhost:4246/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('express');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("express with qhttp");
                console.time('express');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        method: 'POST',
                        url: "http://localhost:4246/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('express');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with qhttp");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        method: 'POST',
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4244/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

            function(next) {
                console.log("");
                console.log("restiq with qhttp");
                console.time('restiq');
                var ndone = 0;
                for (var i=0; i<10000; i++) {
                    var uri = {
                        url: "http://localhost:4244/testlog/write",
                        body: loglines[i],
                        agent: httpAgent,
                    };
                    qhttp.post(uri, function(err, res, body) {
                        ndone += 1;
                        if (ndone == 10000) {
                            qhttp.post("http://localhost:4246/testlog/sync", function(err, res) {
                                console.timeEnd('restiq');
                                next();
                            })
                        }
                    })
                }
            },

/**/

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
}
