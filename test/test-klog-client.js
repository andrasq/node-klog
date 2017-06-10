'use strict';

var klog = require('../');
var KlogClient = require('../lib/klog-client.js');
var qhttp = require('qhttp');
var qrpc = require('qrpc');

module.exports = {
    before: function(done) {
        this.server = klog.createServer({
            logs: {
                testlog: {
                    write: function(str) { },
                    fflush: function(cb){ cb() },
                }
            },
        }, done);
    },

    after: function(done) {
        this.server.close(done);
    },

    'client': {

        'should createClient': function(t) {
            klog.createClient('testlog', function(client) {
                t.equal(client.logname, 'testlog');
                t.equal(client.qrpcPort, klog.qrpcPort);
                t.ok(client instanceof KlogClient);
                client.close();
                t.done();
            })
        },

        'should create multiple clients': function(t) {
            var client1 = klog.createClient('testlog', function(c) { c.close() });
            var client2 = klog.createClient('testlog', function(c) { c.close() });
            t.ok(client1 != client2);
            t.ok(client1 instanceof KlogClient);
            t.ok(client2 instanceof KlogClient);
            t.done();
        },

        'should change logname': function(t) {
            klog.createClient('testlog', function(client) {
                var spy = t.spyOnce(client.client, 'call');
                client.setLogname('otherlog');
                t.deepEqual(spy.callArguments, [ 'logname', 'otherlog' ]);
                t.done();
            })
        },

        'should write': function(t) {
            klog.createClient('testlog', function(client) {
                var spy = t.spyOnce(client.client, 'call');
                client.write('logline');
                t.deepEqual(spy.callArguments, [ 'write', 'logline' ]);
                t.done();
            })
        },

        'should fflush': function(t) {
            klog.createClient('testlog', function(client) {
                var spy = t.spyOnce(client.client, 'call');
                client.fflush(function(err){
// TODO: rename 'sync' to 'fflush'
                    t.equal(spy.callArguments[0], 'sync');
                    t.done();
                })
            })
        },

        'should close': function(t) {
            klog.createClient('testlog', function(client) {
                t.equal(client.closed, false);
                client.close(function(){
                    t.equal(client.closed, true);
                    client.close(function(){
                        t.equal(client.closed, true);
                        t.done();
                    })
                })
            })
        },

        'errors': {

            'createClient should require logname': function(t) {
                t.expect(1);
                t.throws(function(){
                    klog.createClient();
                })
                t.done();
            },

            'setLogname should require logname': function(t) {
                klog.createClient('testlog', function(client) {
                    t.expect(1);
                    t.throws(function(){
                        client.setLogname()
                    })
                    t.done();
                })
            },

        },

    }
}
