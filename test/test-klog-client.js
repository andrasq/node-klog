'use strict';

var fs = require('fs');
var klog = require('../');
var KlogClient = require('../lib/klog-client.js');
var qhttp = require('qhttp');
var qrpc = require('qrpc');
var Fputs = require('qfputs');
var qmock = require('qnit').qmock;

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

    beforeEach: function(done) {
        this.mockJournal = {
            write: function(appended, callback) {
                if (callback) callback();
            },
            fflush: function(callback) {
                return callback();
            },
            renameFile: function(fromName, toName, callback) {
                callback();
            },
        };
        done();
    },

    'createClient': {

        'should require logname': function(t) {
            t.throws(function(){
                klog.createClient();
            })
            t.done();
        },

        'should create and return KlogClient': function(t) {
            var client1 = klog.createClient('testlog', function(err, client2) {
                t.ifError(err);
                t.equal(client1, client2);
                t.equal(client2.logname, 'testlog');
                t.equal(client2.qrpcPort, klog.qrpcPort);
                t.ok(client1 instanceof KlogClient);
                client2.close();
                t.done();
            })
        },

        'should initialize client.fs to fs functions': function(t) {
            klog.createClient('testlog', function(err, client) {
                t.deepEqual(client.fs, {
                    open: fs.open,
                    close: fs.close,
                    read: fs.read,
                    unlink: fs.unlink,
                });
                t.done();
            })
        },

        'callback should be optional': function(t) {
            klog.createClient('testlog', {});
            setTimeout(function(){ t.done() }, 10);
        },

        'options should be optional': function(t) {
            var client1 = klog.createClient('testlog', function(err, client2) {
                t.ifError(err);
                t.equal(client1, client2);
                t.ok(client1 instanceof KlogClient);
                t.done();
            })
        },

        'should create multiple clients': function(t) {
            var client1 = klog.createClient('testlog', function(e, c) { c.close() });
            var client2 = klog.createClient('testlog', function(e, c) { c.close() });
            t.ok(client1 != client2);
            t.ok(client1 instanceof KlogClient);
            t.ok(client2 instanceof KlogClient);
            t.done();
        },

        'should create journaled client': function(t) {
            var client = klog.createClient('testlog', {journal: '/dev/null'}, function(e, c) {
                t.ifError(e);
                t.ok(client.journal);
                t.ok(client.journal instanceof Fputs);
                t.done();
            })
        },
    },

    'client': {

        'beforeEach': function(done) {
            this.client = klog.createClient('testlog', function() {
                done();
            })
        },

        'afterEach': function(done) {
            if (console.log.restore) console.log.restore();     // un-stub console.log
            qmock.unmockTimers();                               // restore system timers
            this.client.close(done);
        },

        'write': {

            'should write': function(t) {
                var spy = t.spyOnce(this.client.client, 'call');
                this.client.write('logline\n');
                t.deepEqual(spy.callArguments, [ 'testlog_write', 'logline\n' ])
                t.done();
            },

            'should invoke callback': function(t) {
                this.client.write('logline\n', function(err) {
                    t.ifError();
                    t.done();
                })
            },

            'should auto-flush journal': function(t) {
                t.expect(8);
                klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                    t.ifError(err);
                    var spy1 = t.spy(client, '_fflushKlog');
                    var spy2 = t.spy(client, 'fflush');
                    var spy3 = t.spy(client.journal, 'fflush');
                    t.equal(client.dirty, false);
                    client.write('line 1\n');
                    t.equal(client.dirty, true);
                    client.write('line 2\n');
                    // suppress the "could not rename" error
                    t.stub(console, 'log');
                    setTimeout(function() {
                        console.log.restore();
                        t.equal(spy1.callCount, 1);
                        t.equal(spy1.callArguments[0], client);
                        t.equal(spy2.callCount, 1);
                        t.equal(spy3.callCount, 1);
                        t.equal(client.dirty, false);
                        t.done();
                    }, client.flushIntervalMs + 5);
                })
            },

            'should print renameFile error once': function(t) {
                klog.createClient('testlog', {journal: '/dev/null'}, function(err, client) {
                    var stub = t.stub(console, 'log');
                    client.write('logline\n');
                    setTimeout(function() {
                        t.equal(stub.callCount, 1);
                        t.equal(stub.callArguments[2].code, 'EACCES');
                        t.contains(stub.callArguments[2].message, 'permission denied');
                        t.equal(client._notifiedFlushError, true);
                        client.write('logline\n');
                        setTimeout(function() {
                            t.equal(stub.callCount, 1);
                            console.log.restore();
                            t.done();
                        }, client.flushIntervalMs + 5)
                    }, client.flushIntervalMs + 5)
                })
            },
        },

        'fflush': {

            'should fflush to server if no journal': function(t) {
                var spy = t.spyOnce(this.client.client, 'call');
                this.client.fflush(function(err) {
                    t.ifError();
                    t.equal(spy.callCount, 1);
                    t.equal(spy.callArguments[0], 'testlog_fflush');
                    t.done();
                })
            },

            'journaled': {

                'before': function(done) {
                    qmock.stub(fs, 'open', function(name, mode, cb) { return cb(null, 0) });
                    qmock.stub(fs, 'unlink', function(name, cb) { return cb() });
                    qmock.stub(fs, 'read', function() { arguments[arguments.length - 1](null, 0) });
                    qmock.stub(fs, 'close', function(fd, cb) { cb() });
                    done();
                },

                'after': function(done) {
                    fs.open.restore();
                    fs.unlink.restore();
                    fs.read.restore();
                    fs.close.restore();
                    setTimeout(done, 20);
                },

                'beforeEach': function(done) {
                    // stub out the mockJournal fs methods
                    this.openSpy = qmock.spy(this.client.fs, 'open', function(name, mode, cb) { return cb(null, 0) });
                    this.unlinkSpy = qmock.spy(this.client.fs, 'unlink', function(name, cb) { return cb() });
                    this.readSpy = qmock.spy(this.client.fs, 'read', function() { arguments[arguments.length - 1](null, 0) });
                    this.closeSpy = qmock.spy(this.client.fs, 'close', function(fd, cb) { cb() });
                    done();
                },

                'multiple fflush should all complete': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        var doneTimes = [];
                        client.write('logline\n');
                        for (var i=0; i<40; i++) client.fflush(onFlush);
                        function onFlush(err) {
                            doneTimes.push(Date.now());
                            if (doneTimes.length === 40) {
                                for (var i=1; i<doneTimes.length; i++) {
                                    t.ok(doneTimes[i] == doneTimes[0] || doneTimes[i] == doneTimes[0] + 1);
                                }
                                t.done();
                            }
                        }
                    })
                },

                'should return journal fflush error': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        t.ifError(err);
                        t.stubOnce(client.journal, 'fflush', function(cb) { cb(new Error('test fflush error')) });
                        client.fflush(function(err) {
                            t.equal(err.message, 'test fflush error');
                            t.done();
                        })
                    })
                },

                'should return journal renameFile error': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        t.ifError(err);
                        t.stub(client, '_sendFileContents', function(){ arguments[arguments.length - 1]() });
                        t.stubOnce(client.journal, 'renameFile', function(fm, to, cb) { cb(new Error('test renameFile error')) });
                        client.fflush(function(err) {
                            t.equal(err.message, 'test renameFile error');
                            t.done();
                        })
                    })
                },

                'should return client.call error': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        t.stub(client.journal, 'renameFile', function(fm, to, cb) { cb() });
                        t.stub(client, '_sendFileContents', function(name, cb) { cb() });
                        t.stub(client.client, 'call', function() { var cb = arguments[arguments.length - 1]; cb(new Error('test call error')) });
                        client.fflush(function(err) {
                            t.ok(err);
                            t.equal(err.message, 'test call error');
                            t.done();
                        })
                    })
                },

                'should add journaled fflush callback as flushDone listener': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        var myCb = function(){};
                        t.stub(client, '_sendFileContents', function(name, cb) { cb() });
                        client.fflush(myCb);
                        // node-v6 returns a function g with property `listener`, node-v7 and up return the callback
                        var listener = client.emitter.listeners('flushDone')[0];
                        t.ok((listener.listener === myCb) || (listener === myCb));
                        t.done();
                    })
                },

                'should emit a journaled fflush flushDone event': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        client.emitter.on('flushDone', function(err) {
                            t.done();
                        })
                        t.stub(client, '_sendFileContents', function(name, cb) { cb() });
                        client.fflush(function(){});
                    })
                },

                'should still add journaled callback listener if already flushing': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        client.flushing = true;
                        var myCb = function(){};
                        t.stub(client, '_sendFileContents', function(name, cb) { cb() });
                        client.fflush(myCb);
                        t.equal(client.emitter.listeners('flushDone').length, 1);
                        var listener = client.emitter.listeners('flushDone')[0];
                        t.ok((listener.listener === myCb) || (listener === myCb));
                        t.done();
                    })
                },

                'should skip flush on journaled renameFile ENOENT': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        var stub = t.stubOnce(client.journal, 'renameFile', function(fm, to, cb) { var e = new Error('test rename enoent error'); e.code = 'ENOENT'; cb(e) });
                        var spy = t.spyOnce(client, '_sendFileContents', function(name, cb) { cb() });
                        client.fflush(function(err) {
                            t.ifError(err);
                            t.equal(spy.callCount, 0);
                            t.done();
                        })
                    })
                },

                'should call _sendFileContents then unlink if grabbed ok': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal, journalName: 'testlog.log'}, function(err, client) {
                        var renameStub = t.spy(client.journal, 'renameFile', function(fm, to, cb) { cb() });
                        var sendStub = t.stub(client, '_sendFileContents', function(name, cb) { cb() });
                        var unlinkStub = t.stubOnce(client.fs, 'unlink', function(name, cb) { cb() });
                        client.fflush(function(err) {
                            t.ifError(err);
                            t.equal(renameStub.callCount, 1);
                            t.equal(renameStub.callArguments[0], 'testlog.log');
                            t.equal(renameStub.callArguments[1], 'testlog.log.up');
                            t.equal(sendStub.callCount, 1);
                            t.equal(sendStub.callArguments[0], 'testlog.log.up');
                            t.equal(unlinkStub.callCount, 1);
                            t.equal(unlinkStub.callArguments[0], 'testlog.log.up');
                            t.done();
                        })
                    })
                },

                'should call _sendFileContents twice if grabbed journal EEXIST': function(t) {
                    klog.createClient('testlog', {journal: this.mockJournal}, function(err, client) {
                        var okStub = t.stub(client.journal, 'renameFile', function(fm, to, cb) { cb() });
                        var errStub = t.stubOnce(client.journal, 'renameFile', function(fm, to, cb) { var e = new Error('test rename eexist error'); e.code = 'EEXIST'; cb(e) });
                        var sendStub = t.stub(client, '_sendFileContents', function(nm, cb) { cb() });
                        client.fflush(function(err) {
                            t.equal(okStub.callCount, 1);
                            t.equal(errStub.callCount, 1);
                            t.equal(sendStub.callCount, 2);
                            t.done();
                        })
                    })
                },

            },

        },

        '_sendFileContents': {

            'beforeEach': function(done) {
                this.openSpy = qmock.spy(this.client.fs, 'open', function(name, mode, cb) { return cb(null, 0) });
                this.unlinkSpy = qmock.spy(this.client.fs, 'unlink', function(name, cb) { return cb() });
                this.readSpy = qmock.spy(this.client.fs, 'read', function() { arguments[arguments.length - 1](null, 0) });
                this.closeSpy = qmock.spy(this.client.fs, 'close', function(fd, cb) { cb() });
                done();
            },

            'afterEach': function(done) {
                done();
            },

            'should open and read the grabbed file': function(t) {
                var self = this;
                this.client._sendFileContents('dummy.up', function(err) {
                    t.equal(self.openSpy.callCount, 1);
                    t.equal(self.openSpy.callArguments[0], 'dummy.up');
                    t.equal(self.readSpy.callCount, 1);
                    t.done();
                })
            },

            'should return open error': function(t) {
                var spy = t.spyOnce(this.client.fs, 'open', function(name, mode, cb) { return cb(new Error("EOPEN")) });
                this.client._sendFileContents('dummy.up', function(err) {
                    t.ok(err);
                    t.equal(err.message, 'EOPEN');
                    t.done();
                })
            },

            'should return read error': function(t) {
                var spy = t.spyOnce(this.client.fs, 'read', function(fd, buf, offs, len, to, cb) { return cb(new Error("EREAD")) });
                this.client._sendFileContents('dummy.up', function(err) {
                    t.ok(err);
                    t.equal(err.message, 'EREAD');
                    t.done();
                })
            },

            'should send short file': function(t) {
                var ncalls = 0;
                var data = "short file contents";
                var readStub = t.stub(this.client.fs, 'read', function(fd, buf, base, bound, from, cb) {
                    if (ncalls++ > 0) return cb(null, 0);
                    buf.write(data);
                    cb(null, data.length);
                })
                var writeSpy = t.spy(this.client.client, 'call');
                this.client._sendFileContents('dummy.up', function(err) {
                    readStub.restore();
                    t.equal(writeSpy.callCount, 1);
                    t.deepEqual(writeSpy.callArguments, ['testlog_write', new Buffer(data)]);
                    t.done();
                })
            },

            'should send long file in chunks': function(t) {
                var nbytes = 0;
                var sent = "";
                var data = "some more file contents\n";
                var readStub = t.stub(this.client.fs, 'read', function(fd, buf, base, bound, from, cb) {
                    if (nbytes >= 500000) return new cb(null, 0);
                    buf.write(data, base);
                    sent += data;
                    nbytes += data.length;
                    cb(null, data.length);
                })
                var writeSpy = t.spy(this.client.client, 'call');
                this.client._sendFileContents('dummy.up', function(err) {
                    readStub.restore();
                    t.equal(writeSpy.callCount, Math.ceil(nbytes / 60000));
                    t.equal(writeSpy.callArguments[0], 'testlog_write');
                    var received = "";
                    for (var i=0; i<writeSpy.callCount; i++) {
                        received += writeSpy.getAllArguments()[i][1];
                    }
                    t.equal(received, sent);
                    t.done();
                })
            },

        },

        'close': {

            'should close client and rpc client': function(t) {
                klog.createClient('testlog', function(err, client) {
                    t.ifError(err);
                    t.equal(client.closed, false);
                    var spy = t.spyOnce(client.client, 'close');
                    client.close(function(){
                        t.equal(client.closed, true);
                        t.equal(spy.callCount, 1);
                        client.close(function(){
                            t.equal(client.closed, true);
                            t.done();
                        })
                    })
                })
            },

        },

        'call': {

            'should make rpc call to server': function(t) {
                var spy = t.stubOnce(this.client.client, 'call');
                this.client.call('logfile_function', 123, function(err){
                })
                t.equal(spy.callCount, 1);
                t.equal(spy.callArguments[0], 'logfile_function');
                t.equal(spy.callArguments[1], 123);
                t.equal(typeof spy.callArguments[2], 'function');
                t.done();
            },

            'body should be optional': function(t) {
                var spy = t.stubOnce(this.client.client, 'call');
                this.client.call('logfile_function', function(err) {
                })
                t.equal(spy.callCount, 1);
                t.equal(spy.callArguments[0], 'logfile_function');
                t.equal(spy.callArguments[1], undefined);
                t.equal(typeof spy.callArguments[2], 'function');
                t.done();
            },
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
