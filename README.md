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

Performance with node-v6.9.1:

    qtimeit=0.19.0 node=6.9.1 v8=5.1.281.84 platform=linux kernel=3.16.0-4-amd64 up_threshold=11
    arch=ia32 mhz=4418 cpuCount=8 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name                                speed           rate
    express w request 1                 6,367 ops/sec   1000 >>>>>
    express w request 2                 6,936 ops/sec   1089 >>>>>
    express w request 3                 7,208 ops/sec   1132 >>>>>>
    express w qhttp 1                  13,549 ops/sec   2128 >>>>>>>>>>>
    express w qhttp 2                  13,822 ops/sec   2171 >>>>>>>>>>>
    express w qhttp 3                  13,983 ops/sec   2196 >>>>>>>>>>>
    restiq w qhttp 1                   14,637 ops/sec   2299 >>>>>>>>>>>
    restiq w qhttp 2                   15,201 ops/sec   2387 >>>>>>>>>>>>
    restiq w qhttp 3                   14,995 ops/sec   2355 >>>>>>>>>>>>
    restiq w request 1                  7,853 ops/sec   1233 >>>>>>
    restiq w request 2                  7,296 ops/sec   1146 >>>>>>
    restiq w request 3                  7,128 ops/sec   1120 >>>>>>
    qrpc w qrpc 1                      30,600 ops/sec   4806 >>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 2                      31,495 ops/sec   4946 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 3                      31,492 ops/sec   4946 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 1k 1                   13,244 ops/sec   2080 >>>>>>>>>>
    qrpc w qrpc 1k 2                   13,275 ops/sec   2085 >>>>>>>>>>
    qrpc w qrpc 1k 3                   13,301 ops/sec   2089 >>>>>>>>>>
    qrpc w klogClient 1                31,127 ops/sec   4889 >>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 2                31,703 ops/sec   4979 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 3                31,513 ops/sec   4949 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 100k stream 1       238 ops/sec     37
    qrpc w klogClient 100k stream 2       237 ops/sec     37
    qrpc w klogClient 100k stream 3       239 ops/sec     38

Under node-v8.0.0, request is 20% faster than and express + request is 30% faster than
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

