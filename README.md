klog
================

Kinvey Hackathon, 2017-06-12 - [Andras](https://npmjs.com/~andrasq).

Fast, robust remote logging service.


Summary
----------------

Klog spools and transports newline terminated content to a remote location,
useful for logs.


API
----------------

### klog.createServer( config )

Create a server to listen for and accept uploaded logs.

Config:

- `httpPort` - http port to listen on
- `qrpcPort` - qrpc port to listen on
- `logs` - list of logs to manage

#### server.


### klog.createClient( options )

Create a `qlogger` compatible log writer.  Qlogger can filter, convert,
format and annotate the log lines, and klog will transport the logged lines
to the remote logging server.

Options:

- `url` - address of klog server to send to
- `journal` - name of local file into which to persist log lines

#### client.write( line )

Append a line to the log.  Writing is asynchronous; use `fflush` to ensure that the
line has been recorded to the journal or `sync` that is has been recorded on the server.

#### client.close( )

Disconnect from the klog server.  Note that this does not `fflush`.

#### client.fflush( cb )

Wait for all the logged lines to be persisted to the local journal.

#### client.sync( cb )

Wait for all the written lines to be persisted on the remo
