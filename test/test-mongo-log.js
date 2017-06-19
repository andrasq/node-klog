'use strict';

var MongoLog = require('../lib/mongo-log.js');
var qmock = require('qnit').qmock;

module.exports = {
    beforeEach: function(done) {
        var self = this;
        this.mongod = {};
        this.coll = {
            insert: qmock.spy(function() {
                var cb = arguments[arguments.length - 1];
                cb();
            }),
        };
        this.mongod.db = function(dbName) {
            self.dbName = dbName;
            return {
                collection: function(collName) {
                    self.collName = collName;
                    return self.coll;
                }
            }
        };
        this.logger = new MongoLog(this.mongod);
        done();
    },

    afterEach: function(done) {
        qmock.unmockTimers();
        done();
    },

    'constructor': {
        'should construct mongo logger': function(t) {
            var logger = new MongoLog(this.mongod);
            t.equal(logger.mongo, this.mongod);
            t.deepEqual(logger.pending, {});
            t.deepEqual(logger.fflushError, []);
            t.done();
        },
    },

    'write': {
        'should queue writes': function(t) {
            var loglines = '{"_db":"db1","_coll":"coll1","m":"test line 1"}\n';
            loglines += '{"_db":"db2","_coll":"coll2","m":"test line 2"}\n';
            this.logger.write(loglines);
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 3"}');
            t.equal(Object.keys(this.logger.pending).length, 2);
            t.deepEqual(this.logger.pending['db1:coll1'], [ {m: 'test line 1'}, {m: 'test line 3'} ]);
            t.deepEqual(this.logger.pending['db2:coll2'], [ {m: 'test line 2'} ]);
            t.done();
        },

        'should auto-flush writes': function(t) {
            var clock = t.mockTimers();
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 1"}');
            clock.tick(200);
            t.equal(this.coll.insert.stub.callCount, 1);
            t.deepEqual(this.coll.insert.stub.callArguments[0], [ {m: 'test line 1'} ]);
            t.deepEqual(this.coll.insert.stub.callArguments[1], {w: 1});
            t.deepEqual(typeof this.coll.insert.stub.callArguments[2], 'function');
            t.equal(this.dbName, 'db1');
            t.equal(this.collName, 'coll1');
            t.done();
        },
    },

    'fflush': {
        'should require callback': function(t) {
            var self = this;
            t.throws(function() {
                self.logger.fflush();
            })
            t.done();
        },

        'should commit pending writes': function(t) {
            var self = this;
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 1"}');
            this.logger.write('{"_db":"db2","_coll":"coll1","m":"test line 2"}');
            this.logger.fflush(function(err) {
                t.equal(self.coll.insert.stub.callCount, 2);
                t.deepEqual(self.coll.insert.stub.callArguments[0], [ {m: 'test line 2'} ]);
                t.done();
            })
        },

        'should return write errors': function(t) {
            var self = this;
            var spy = t.spyOnce(this.coll, 'insert', function() {
                var cb = arguments[arguments.length - 1];
                return cb(new Error("test error"));
            })
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 2"}');
            this.logger.fflush(function(err) {
                t.ok(err);
                t.equal(err.message, 'test error');
                t.done();
            })
        },

        'should return delayed write error': function(t) {
            var clock = t.mockTimers();
            var spy = t.spyOnce(this.coll, 'insert', function() {
                var cb = arguments[arguments.length - 1];
                return cb(new Error("test error 2"));
            })
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 2"}');
            clock.tick(200);
            this.logger.fflush(function(err) {
                t.ok(err);
                t.equal(err.message, 'test error 2');
                t.done();
            })
        },

        'should return array of delayed write errors': function(t) {
            var clock = t.mockTimers();
            var ncalls = 0;
            var spy = t.spy(this.coll, 'insert', function() {
                var cb = arguments[arguments.length - 1];
                return cb(new Error("test error " + ++ncalls));
            })
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 2"}');
            clock.tick(200);
            this.logger.write('{"_db":"db1","_coll":"coll1","m":"test line 3"}');
            clock.tick(200);
            this.logger.fflush(function(err) {
                t.ok(err instanceof Array);
                t.equal(err.length, 2);
                t.equal(err[0].message, 'test error 1');
                t.equal(err[1].message, 'test error 2');
                t.done();
            })
        },

        'should skip write if nothing to commit': function(t) {
            var self = this;
            this.logger.fflush(function(err) {
                t.ifError(err);
                t.equal(self.coll.insert.stub.callCount, 0);
                self.logger.fflush(function(err) {
                    t.ifError(err);
                    t.equal(self.coll.insert.stub.callCount, 0);
                    t.done();
                })
            })
        },
    },
}
