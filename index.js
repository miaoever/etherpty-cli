var etherpty = require("./lib/client");

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
//Prees ctrl+C to exit.
process.stdin.on('data', function(data){
  if (data === '\u0003')
    process.exit();
});

var argv = require('minimist')(process.argv.slice(2));
var action = argv._[0] || "";

if (!(action === "share") && !(action === "join")) {
  return console.log('\n>> Usage: etherpty share server_address[:port]|join url[:port] \n');
}

var url = require("url").parse(argv._[1]);
var host = url.host;
var token = url.path.replace(/\//g, "");

if (action === "share") {
  etherpty.share(host);
} else {
  if (!token) return console.log('\n>> Usage: etherpty share server_address[:port]|join url[:port] \n');
  etherpty.join(host, token);
}

