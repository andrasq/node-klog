klog
================

Kinvey Hackathon, 2017-06-12 - [Andras](https://npmjs.com/~andrasq).

Fast, robust remote logging service.


Summary
----------------

Klog spools and transports newline terminated content to a remote location, useful for
logs.  Logs can be uploaded a line at a time or from the logfile, via the API or scripted
with `curl -d @logfile`.  Log lines are written to file under a mutex, so multiple
simultaneous writes will not collide.

For easy integration with app-side logging, a klog client is usable as the qlogger
writer for spooling logs to a local journal then sending them to a remote log server:

    var qlogger = require('qlogger');

    var loglevel = 'info';
    var logname = 'testlog';
    var klogClient = klog.createClient(logname, {
        qrpcPort: 4245,
        host: 'localhost',
        journal: "testlog.jour",
    });

    log = qlogger(loglevel, klogClient);


API
----------------

### klog.createServer( config )

Create a server to listen for and accept uploaded logs.

Config:

- `httpPort` - http port to listen on.  Default 4244.
- `qrpcPort` - qrpc port to listen on.  Default 4245.
- `logs` - list of logs to manage

#### POST /:logname/write

Append to the named log.

#### POST /:logname/fflush

Flush the pending writes to backing store.

### klog.createClient( logname, options, callback )

Create a `qlogger` compatible log writer.  Qlogger can filter, convert,
format and annotate the log lines, and klog will transport the logged lines
to the remote logging server.

Options:

- `url` - address of klog server to send to
- `journal` - name of local file into which to persist log lines

#### client.write( line )

Append a line to the log.  Writing is asynchronous; use `fflush` to ensure that the
line has been recorded on the server.

#### client.fflush( cb )

Wait for all the logged lines to be persisted on the remote log server.

#### client.close( )

Disconnect from the klog server.  Note that this does not `fflush`.


Performance
----------------

Realtime transport.

Performance measured as the count of 200 byte log lines per second delivered to the
log server:

    qtimeit=0.20.0 node=6.9.1 v8=5.1.281.84 platform=linux kernel=3.16.0-4-amd64 up_threshold=11
    arch=ia32 mhz=4419 cpuCount=8 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    timeGoal=4.4 opsPerTest=100 forkTests=false
    name                        speed           rate
    express w request 1         7,402 ops/sec    370 >>
    express w request 2         7,674 ops/sec    384 >>
    express w request 3         7,696 ops/sec    385 >>
    restiq w request 1          7,619 ops/sec    381 >>
    restiq w request 2          7,729 ops/sec    386 >>
    restiq w request 3          7,681 ops/sec    384 >>
    express w qhttp 1          17,279 ops/sec    864 >>>>
    express w qhttp 2          17,194 ops/sec    860 >>>>
    express w qhttp 3          17,174 ops/sec    859 >>>>
    restiq w qhttp 1           20,390 ops/sec   1020 >>>>>
    restiq w qhttp 2           20,261 ops/sec   1013 >>>>>
    restiq w qhttp 3           20,058 ops/sec   1003 >>>>>
    qrpc w qrpc 1             177,453 ops/sec   8873 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 2             180,299 ops/sec   9015 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 3             187,126 ops/sec   9356 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 1       181,743 ops/sec   9087 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 2       187,490 ops/sec   9375 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 3       188,680 ops/sec   9434 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 1k 1          202,832 ops/sec  10142 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 1k 2          203,937 ops/sec  10197 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 1k 3          204,159 ops/sec  10208 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 10k 1   196,647 ops/sec   9832 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 10k 2   197,196 ops/sec   9860 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 10k 3   197,629 ops/sec   9881 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

Under node-v8.0.0, request is 20% faster and express + request is 30% faster than
under node-v6.9.1, but both are still much slower than qrpc or just using qhttp.

Realtime transport with checkpoint.

Journaled near-realtime transport with checkpoint.


Related Work
----------------

- [express](https://npmjs.com/package/express) - featureful REST framework
- [request](https://npmjs.com/package/request) - featureful but slow http request library
- [restiq](https://npmjs.com/package/restiq) - light-weight REST framework
- [qhttp](https://npmjs.com/package/qhttp) - fast convenience wrapper around `http`
- [qlogger](https://npmjs.com/package/qlogger) - very fast, very flexible logging
- [qrpc](https://npmjs.com/package/qrpc) - very fast rpc


TODO
----------------

- SIGTERM handler to shut down cleanly: close inbound sockets, wait for current writes to complete
