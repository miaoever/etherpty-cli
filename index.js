var etherpty = require("./lib/client");
var config = require("./config/config.json");

module.exports = etherpty;

var argv = require('minimist')(process.argv.slice(2));
var action = argv._[0] || "";

if (!(action === "share") && !(action === "join")) {
  console.log('>> Usage: etherpty share server_address|join url\n');
  process.exit();
}

var port = config.server.port;
port = port === "80"? "" :  ":" + port;

var url = require("url").parse(argv._[1] 
                               || config.server.protocol + "://" + config.server.host + port );
var host = url.host;

if (action === "share") {
  etherpty.share(host, argv.editable || argv.e || false);
  
} else {
  var token =  url.path.replace(/\//g, "");
  if (!token) {
    console.log('\n>> Usage: etherpty share server_address|join url\n');
    process.exit();
  }
  etherpty.join(host, token);
}

