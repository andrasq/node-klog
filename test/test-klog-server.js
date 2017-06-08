'use strict';

var createServer = require('../lib/klog-server.js');
var qhttp = require('qhttp');

module.exports = {
    'klog-server': {
        'should export a function': function(t) {
            t.equal(typeof createServer, 'function');
            t.done();
        },

        'should create and close log server': function(t) {
            var klog = createServer(function(){
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
            var klog = createServer(function(err, klog2) {
                t.equal(klog, klog2);
                klog.close(function() {
                    t.done();
                })
            })
        },

        'should close more than once': function(t) {
            var klog = createServer(function() {
                klog.close(function() {
                    klog.close(function() {
                        klog.close(function() {
                            t.done()
                        })
                    })
                })
            })
        },
    },

    'httpServer': {
        beforeEach: function(done) {
            var testlog = [];
            var config = {
                logs: {
                    testlog: {
                        write: function(str, cb) { testlog.push(str); cb() },
                        fflush: function(cb) { cb() },
                    }
                },
            };
            this.testlog = testlog;
            this.server = createServer(config, done);
        },

        afterEach: function(done) {
            this.server.close(done);
        },

        'should log lines': function(t) {
            var self = this;
            qhttp.post("http://localhost:4244/testlog/write", "logline1\n", function(err, res, body) {
                qhttp.post("http://localhost:4244/testlog/write", "logline2\nlogline3\n", function(err, res, body) {
                    t.equal(self.testlog[0], 'logline1\n');
                    t.equal(self.testlog[1], 'logline2\nlogline3\n');
                    t.done();
                })
            })
        },

        'should newline terminate loglines': function(t) {
            var self = this;
            qhttp.post("http://localhost:4244/testlog/write", "logline", function(err, res, body) {
                t.equal(self.testlog[0], 'logline\n');
                t.done();
            })
        },

        'should return error if log not found': function(t) {
            qhttp.post("http://localhost:4244/nosuchlog/write", "logline", function(err, res, body) {
console.log("AR: notfound got", res.statusCode, body+"");
                t.equal(res.statusCode, 400);
                t.contains(body + '', "");
                t.done();
            })
        },
    },
}
