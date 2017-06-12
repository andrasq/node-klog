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

#### POST /:logname/sync

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
line has been recorded to the journal or `sync` that is has been recorded on the server.

#### client.fflush( cb )

Wait for all the logged lines to be persisted on the remote log server.

#### client.close( )

Disconnect from the klog server.  Note that this does not `fflush`.


Performance
----------------

Performance with node-v6.9.1, timeGoal=4.0:

    qtimeit=0.20.0 node=6.9.1 v8=5.1.281.84 platform=linux kernel=3.16.0-4-amd64 up_threshold=11
    arch=ia32 mhz=4416 cpuCount=8 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name                    speed           rate
    express w request 1     7,397 ops/sec    370 >>
    express w request 2     7,517 ops/sec    376 >>
    express w request 3     7,755 ops/sec    388 >>
    express w qhttp 1      16,881 ops/sec    844 >>>>
    express w qhttp 2      16,969 ops/sec    848 >>>>
    express w qhttp 3      16,969 ops/sec    848 >>>>
    restiq w qhttp 1       20,054 ops/sec   1003 >>>>>
    restiq w qhttp 2       20,063 ops/sec   1003 >>>>>
    restiq w qhttp 3       19,974 ops/sec    999 >>>>>
    restiq w request 1      7,640 ops/sec    382 >>
    restiq w request 2      7,776 ops/sec    389 >>
    restiq w request 3      7,741 ops/sec    387 >>
    qrpc w qrpc 1         181,231 ops/sec   9062 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 2         188,055 ops/sec   9403 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 3         188,917 ops/sec   9446 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 1   189,825 ops/sec   9491 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 2   190,908 ops/sec   9545 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 3   190,291 ops/sec   9515 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

Under node-v8.0.0, request is 20% faster and express + request is 30% faster than
under node-v6.9.1, but both are still much slower than qrpc or just using qhttp.


Related Work
----------------

- [qrpc](https://npmjs.com/package/qrpc) - very fast rpc
- [qhttp](https://npmjs.com/package/qhttp) - fast convenience wrapper around `http`
- [request](https://npmjs.com/package/request) - featureful but slow http request library
- [express](https://npmjs.com/package/express) - featureful REST framework
- [restiq](https://npmjs.com/package/restiq) - light-weight REST framework


TODO
----------------

- rely on just write and fflush, deprecase sync (local journal is implementation detail; fflush to remote)
- update readme for the above

