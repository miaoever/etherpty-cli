var monkey_patch_wsConnection = require("../lib/monkey_patch_wsConnection")
  , wsClient = require("websocket").client;

exports.join = function(host, token) {
  var clientMeta = new wsClient();
  var clientIO = new wsClient();

  clientMeta.connect(host + "/pty/meta/" + token, 'etherpty-protocol');
  
  clientMeta.on("connect", function(connection) {
    var meta = monkey_patch_wsConnection(connection, "meta");

    meta.sendMessage({type:"join", token:token});

    meta.on("error", function(data){
      console.log(">> connection crror: " + data.toString());
      meta.close();
      process.exit();
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

    meta.on("join", function(data) {
      clientIO.connect(host + "/pty/io/client/" + data.token, 'etherpty-protocol');
      clientIO.on("connect", function(io) {
        //
        //Double press ctrl+C to exit.
        process.stdin.removeAllListeners('data');
        /*
         * disabled the client control logic now.
        process.stdin.on('data', function(data){
          io.send(data);
        });
        */
        io.on('message', function(message){
          if (message.type === 'utf8') process.stdout.write(message.utf8Data);
        });
      });
    });

  });
};

exports.share = function(host) {
  var masterMeta = new wsClient();
  var masterIO = new wsClient();

  masterMeta.connect('ws://localhost:8081/pty/meta/0', 'etherpty-protocol');
  masterMeta.on("connect", function(connection) {
    var meta = monkey_patch_wsConnection(connection, "meta");

    meta.sendMessage({type:"share"});

    meta.on("share", function(data) {
      console.log("Your shell is shared at: " + host + data.token);
    });

    meta.on("start", function(data) {
      //build the io connection
      masterIO.connect(host + '/pty/io/master/' + data.token, 'etherpty-protocol');
      masterIO.on("connect", function(io) {
        io.send("message from the master."); 
      });
    });

  });
}
