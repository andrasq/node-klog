'use strict';

module.exports = MongoLog;

function MongoLog( mongo ) {
    this.flushLatencyMs = 200;
    this.mongo = mongo;
    this.pending = {};
    this.fflushError = [];
}

/*
 * append one or more newline terminated json documents to the collection
 */
MongoLog.prototype.write = function write( jsons ) {
    var lines = jsons.split('\n');
    for (var i=0; i<lines.length; i++) if (lines[i].length > 0) _appendPending(this, JSON.parse(lines[i]));
}

/*
 * persist all queued documents to their backing collections
 */
MongoLog.prototype.fflush = function fflush( callback ) {
    if (typeof callback !== 'function') throw new Error("callback required");

    var pendingNames = Object.keys(this.pending);
    var self = this;

    if (this.fflushError.length) {
        var err = this.fflushError;
        this.fflushError = [];
        return callback(err.length > 1 ? err : err[0]);
        // TODO: also start another flush
    }

    (function flushAll( ) {
        var name = pendingNames.shift();
        _flushPending(self, name, function(err) {
            if (err) return callback(err);
            if (pendingNames.length) setImmediate(flushAll);
            else callback();
        })
    })();
}

// expose helper functions for testing
MongoLog.prototype._appendPending = _appendPending;
MongoLog.prototype._flushPending = _flushPending;


// append a document to the mongo collection
function _appendPending( mongolog, doc ) {
    var pendingName = doc._db + ':' + doc._coll;
    delete doc._db; delete doc._coll;

    if (!mongolog.pending[pendingName]) {
        mongolog.pending[pendingName] = new Array();
        setTimeout(_flushPending, mongolog.flushLatencyMs, mongolog, pendingName, autoFlush);
    }
    mongolog.pending[pendingName].push(doc);

    function autoFlush(err) {
        if (err) mongolog.fflushError.push(err);
    }
}

// insert into mongo the pending documents
function _flushPending( mongolog, pendingName, callback ) {
    if (!mongolog.pending[pendingName]) return callback();

    var toInsert = mongolog.pending[pendingName];
    delete mongolog.pending[pendingName];
    var dbColl = pendingName.split(':');

    mongolog.mongo.db(dbColl[0]).collection(dbColl[1]).insert(toInsert, {w:1}, callback);
}

// accelerate method lookup
MongoLog.prototype = MongoLog.prototype;
