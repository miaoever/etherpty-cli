#!/usr/bin/env node
var etherpty = require('../');
var argv = require('minimist')(process.argv.slice(2));
var action = argv._[0] || "";

if (!(action === "share") && !(action === "join")) {
  console.log('>> Usage: etherpty share server_address[:port]|join url[:port]');
  process.exit();
}

var url = require("url").parse(argv._[1]);
var host = url.host;
var token = url.path.replace(/\//g, "");

if (action === "share") {
  etherpty.share(host);
} else {
  if (!token) {
    console.log('>> Usage: etherpty share server_address[:port]|join url[:port]');
    process.exit();
  }
  etherpty.join(host, token);
}
