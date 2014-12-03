var monkey_patch_wsConnection = require("../lib/monkey_patch_wsConnection");
var wsClient = require("websocket").client;
var pty = require("pty.js");
var keypress = require('keypress');
var config = require("../config/config.json");


// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

var term = pty.fork(process.env.SHELL || 'bash', [], {
  // name: require('fs').existsSync('/usr/share/terminfo/x/xterm-256color')
  //   ? 'xterm-256color'
  //   : 'xterm',
  name : 'xterm',
  cols: process.stdout.columns,
  rows: process.stdout.rows,
  cwd: process.env.HOME,
  env: process.env
});

exports.join = function(host, token) {
  var clientMeta = new wsClient();
  var clientIO = new wsClient();

  var proto = config.server.protocol;
  var url = proto + "://" + host;

  clientMeta.connect(url + "/pty/meta/" + token, 'etherpty-protocol');
  
  clientMeta.on("connectFailed", function(err) {
    console.log(err.stack);
  });

  clientMeta.on("connect", function(connection) {
    var meta = monkey_patch_wsConnection(connection, "meta");

    meta.sendMessage({type:"join", token:token});

    meta.on("error", function(data){
      console.log(">> connection error: " + data.message);
      meta.close();
      process.exit();
    });

    meta.on("resize", function(data) {
      process.stdout.columns = data.col;
      process.stdout.rows = data.row;
    });

    meta.on("close", function() {
      console.log('>> etherpty connection closed.');
      meta.close();
      process.exit();
    });

    meta.on("exit", function(data) {
      console.log('\n>> remote terminal exit.')
      meta.close();
    });

    process.stdin.on('keypress', function (chunk, key) {
      if (key && key.ctrl && key.name == 'q') {
        console.log("\n>>etherpty exit.");
        meta.close();
        process.exit();
      }
    });

    meta.on("join", function(data) {
      var size = data.size;
      process.stdout.columns = size[0];
      process.stdout.rows = size[1];

      clientIO.connect(url + "/pty/io/client/" + data.token, 'etherpty-protocol');
      clientIO.on("connect", function(io) {
        io.on('message', function(message){
          if (message.type === 'utf8') process.stdout.write(message.utf8Data);
        });
      });
    });

  });
};

exports.share = function(host, editable) {
  var masterMeta = new wsClient();
  var masterIO = new wsClient();

  var proto = config.server.protocol;
  var url = proto + "://" + host;

  var cols = process.stdout.columns;
  var rows = process.stdout.rows;

  masterMeta.connect(url + "/pty/meta/" + cols + "&" + rows, 'etherpty-protocol');

  masterMeta.on("connectFailed", function(err) {
    console.log(err.stack);
  });

  masterMeta.on("connect", function(connection) {
    var meta = monkey_patch_wsConnection(connection, "meta");

    meta.sendMessage({type:"share"});
    process.on('SIGWINCH', function(data) {
      var cols = process.stdout.columns;
      var rows = process.stdout.rows;
      term.resize(cols, rows);
      meta.sendMessage({type:"resize", data:{col:cols, row:rows}});
      //console.log(process.stdout.columns + 'x' + process.stdout.rows);
    });
    
    meta.on("close", function() {
      console.log('>> etherpty connection closed.');
      meta.close();
      process.exit();
    });

    meta.on("share", function(data) {
      var url = proto === "ws"? "http://" + host : "https://" + host;
      //show the http url without port.
      url = url.replace(/:\d+/, "");
      console.log("Your shell is shared at: " + url + "/" + data.token);
    });

    meta.on("start", function(data) {
      //build the io connection
      masterIO.connect(url + '/pty/io/master/' + data.token, 'etherpty-protocol');

      masterIO.on("connect", function(io) {
        // meta.sendMessage({type:"resize", data:{col:process.stdout.columns, row: process.stdout.rows}});
        console.log('Created shell with pty master/slave' + ' pair (master: %d, pid: %d)', term.fd, term.pid);

        process.title = "etherpty broadcasting..."
        process.stdin.setRawMode(true);
        process.stdin.setEncoding('utf8');
        process.stdin.resume();

        process.stdin.on('keypress', function (chunk, key) {
          if (key && key.ctrl && key.name == 'q') {
            console.log("\n>>etherpty exit.");
            meta.close();
            process.exit();
          }
        });

        process.stdin.on('data', function(data){
          term.write(data);
        });

        var shell = process.env.SHELL || 'bash';
        term.write(shell + "\n");

        io.on("message", function(data) {
          if (editable)
            term.write(data.utf8Data);
        });

        term.on("data", function(data) {
          process.stdout.write(data);
          io.send(data);
        });
      });
    });

  });
}
