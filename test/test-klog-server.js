'use strict';

var KlogServer = require('../lib/klog-server.js');
var qhttp = require('qhttp');
var qrpc = require('qrpc');

module.exports = {
    'klog-server': {
        'should export a constructor': function(t) {
            var server = new KlogServer();
            t.ok(server instanceof KlogServer);
            t.done();
        },

        'should expose a builder function': function(t) {
            t.equal(typeof KlogServer.createServer, 'function');
            t.done();
        },

        'should create and close log server': function(t) {
            var klog = KlogServer.createServer(function(){
                t.ok(klog.httpPort > 0);
                t.ok(klog.qrpcPort > 0);
                t.ok(klog.httpServer);
                t.ok(klog.qrpcServer);

                t.equal(typeof klog.close, 'function');
                klog.close(function(){
                    t.done()
                });
            })
        },

        'should return server also in callback': function(t) {
            var klog = KlogServer.createServer(function(err, klog2) {
                t.equal(klog, klog2);
                klog.close(function() {
                    t.done();
                })
            })
        },

        'should close more than once': function(t) {
            var klog = KlogServer.createServer(function() {
                klog.close(function() {
                    klog.close(function() {
                        klog.close(function() {
                            t.done()
                        })
                    })
                })
            })
        },

        'should create express server': function(t) {
            var klog = KlogServer.createServer({ expressPort: 4246 }, function(err, klog2) {
                t.ok(klog.expressServer);
                klog.close(function() {
                    t.done();
                })
            })
        },
    },

    'server': {
        beforeEach: function(done) {
            var testlog = [];
            var config = {
                httpPort: 4244,
                qrpcPort: 4245,
                expressPort: 4246,
                logs: {
                    testlog: {
                        write: function(str, cb) {
                            testlog.push(str);
                            if (cb) cb()
                        },
                        fflush: function(cb) {
                            testlog.push('__fflush__');
                            cb()
                        },
                    }
                },
            };
            this.testlog = testlog;
            this.server = KlogServer.createServer(config, done);
        },

        afterEach: function(done) {
            this.server.close(done);
        },

        'httpServer': {

            'should log lines': function(t) {
                var self = this;
                qhttp.post("http://localhost:4244/testlog/write", "logline1\n", function(err, res, body) {
                    t.equal(res.statusCode, 200);
                    qhttp.post("http://localhost:4244/testlog/write", "logline2\nlogline3\n", function(err, res, body) {
                        t.equal(res.statusCode, 200);
                        t.equal(self.testlog[0], 'logline1\n');
                        t.equal(self.testlog[1], 'logline2\nlogline3\n');
                        t.done();
                    })
                })
            },

            'should skip empty lines': function(t) {
                var self = this;
                qhttp.post("http://localhost:4244/nosuchlog/write", "", function(err, res, body) {
                    t.equal(res.statusCode, 400);
                    t.deepEqual(self.testlog, []);
                    t.done();
                })
            },

            'should return error if log not found': function(t) {
                qhttp.post("http://localhost:4244/nosuchlog/write", "logline", function(err, res, body) {
                    t.equal(res.statusCode, 400);
                    t.contains(body + '', "");
                    t.done();
                })
            },

            'should fflush log': function(t) {
                var self = this;
                qhttp.post("http://localhost:4244/testlog/fflush", "logline", function(err, res, body) {
                    t.equal(res.statusCode, 200);
                    t.deepEqual(self.testlog, [ '__fflush__' ]);
                    t.done();
                })
            },

            'http server should call _doHttpLogWrite': function(t) {
                var spy = t.spyOnce(this.server, '_doHttpLogWrite');
                qhttp.post("http://localhost:4244/testlog/write", "logline\n", function(err, res, body) {
                    t.equal(spy.callCount, 1);
                    t.done();
                })
            },

            'http server should call _doHttpLogSync': function(t) {
                var self = this;
                var spy = t.spyOnce(this.server, '_doHttpLogSync');
                qhttp.post("http://localhost:4244/testlog/fflush", "logline", function(err, res, body) {
                    t.equal(spy.callCount, 1);
                    t.equal(self.testlog[0], '__fflush__');
                    t.done();
                })
            },

            'express server should call _doHttpLogWrite': function(t) {
                var spy = t.spyOnce(this.server, '_doHttpLogWrite');
                qhttp.post("http://localhost:4246/testlog/write", "logline\n", function(err, res, body) {
                    t.equal(spy.callCount, 1);
                    t.done();
                })
            },

            'express server should call _doHttpLogSync': function(t) {
                var self = this;
                var spy = t.spyOnce(this.server, '_doHttpLogSync');
                qhttp.post("http://localhost:4246/testlog/fflush", "logline", function(err, res, body) {
                    t.equal(spy.callCount, 1);
                    t.equal(self.testlog[0], '__fflush__');
                    t.done();
                })
            },
        },

        'qrpcServer': {
            'should log lines': function(t) {
                var self = this;
                var client = qrpc.connect(4245, 'localhost', function(socket) {
                    socket.setNoDelay(true);
                    client.call('testlog_write', 'logline1\n');
                    client.call('testlog_write', 'logline2\nlogline3\n');
                    client.call('testlog_write', new Buffer('logline4\n'));
                    client.call('testlog_fflush', function() {
                        t.deepEqual(self.testlog, ['logline1\n', 'logline2\nlogline3\n', new Buffer('logline4\n'), '__fflush__']);
                        t.done();
                    })
                })
            },
        },

    },
}
