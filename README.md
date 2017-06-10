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
    arch=ia32 mhz=4419 cpuCount=8 cpu="Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz"
    name                                speed         (stats)                                                      rate
    express w request 1                 6,155 ops/sec (40 runs of 2 calls in 1.300 out of 2.019 sec, +/- 0.32%)    1000 >>>>>
    express w request 2                 7,038 ops/sec (47 runs of 2 calls in 1.335 out of 2.040 sec, +/- 0.27%)    1143 >>>>>>
    express w request 3                 6,857 ops/sec (46 runs of 2 calls in 1.342 out of 2.029 sec, +/- 0.25%)    1114 >>>>>>
    express w qhttp 1                  13,717 ops/sec (92 runs of 2 calls in 1.341 out of 2.020 sec, +/- 0.30%)    2228 >>>>>>>>>>>
    express w qhttp 2                  13,923 ops/sec (93 runs of 2 calls in 1.336 out of 2.008 sec, +/- 0.27%)    2262 >>>>>>>>>>>
    express w qhttp 3                  14,386 ops/sec (95 runs of 2 calls in 1.321 out of 2.004 sec, +/- 0.30%)    2337 >>>>>>>>>>>>
    restiq w qhttp 1                   14,955 ops/sec (99 runs of 2 calls in 1.324 out of 2.007 sec, +/- 0.35%)    2429 >>>>>>>>>>>>
    restiq w qhttp 2                   15,591 ops/sec (103 runs of 2 calls in 1.321 out of 2.001 sec, +/- 0.33%)   2533 >>>>>>>>>>>>>
    restiq w qhttp 3                   15,178 ops/sec (102 runs of 2 calls in 1.344 out of 2.002 sec, +/- 0.36%)   2466 >>>>>>>>>>>>
    restiq w request 1                  7,643 ops/sec (50 runs of 2 calls in 1.308 out of 2.007 sec, +/- 0.21%)    1242 >>>>>>
    restiq w request 2                  7,601 ops/sec (51 runs of 2 calls in 1.342 out of 2.009 sec, +/- 0.18%)    1235 >>>>>>
    restiq w request 3                  8,154 ops/sec (51 runs of 2 calls in 1.251 out of 2.004 sec, +/- 0.15%)    1325 >>>>>>>
    qrpc w qrpc 1                      30,217 ops/sec (202 runs of 2 calls in 1.337 out of 2.010 sec, +/- 0.46%)   4909 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 2                      31,121 ops/sec (208 runs of 2 calls in 1.337 out of 2.007 sec, +/- 0.44%)   5055 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 3                      30,472 ops/sec (201 runs of 2 calls in 1.319 out of 2.001 sec, +/- 0.39%)   4950 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w qrpc 1k 1                   11,029 ops/sec (74 runs of 2 calls in 1.342 out of 2.009 sec, +/- 0.28%)    1792 >>>>>>>>>
    qrpc w qrpc 1k 2                   12,080 ops/sec (81 runs of 2 calls in 1.341 out of 2.003 sec, +/- 0.25%)    1962 >>>>>>>>>>
    qrpc w qrpc 1k 3                    9,783 ops/sec (66 runs of 2 calls in 1.349 out of 2.026 sec, +/- 0.23%)    1589 >>>>>>>>
    qrpc w klogClient 1                29,233 ops/sec (195 runs of 2 calls in 1.334 out of 2.006 sec, +/- 0.46%)   4749 >>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 2                29,645 ops/sec (197 runs of 2 calls in 1.329 out of 2.001 sec, +/- 0.46%)   4816 >>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 3                30,900 ops/sec (208 runs of 2 calls in 1.346 out of 2.008 sec, +/- 0.41%)   5020 >>>>>>>>>>>>>>>>>>>>>>>>>
    qrpc w klogClient 100k stream 1       244 ops/sec (2 runs of 2 calls in 1.639 out of 2.464 sec, +/- 0.00%)       40
    qrpc w klogClient 100k stream 2       237 ops/sec (2 runs of 2 calls in 1.686 out of 2.546 sec, +/- 0.02%)       39
    qrpc w klogClient 100k stream 3       224 ops/sec (2 runs of 2 calls in 1.781 out of 2.615 sec, +/- 0.04%)       36

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

