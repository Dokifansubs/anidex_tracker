var common = require('./../tools/common');
var bencode = require('bencode');

var ip = common.hexEncodeIPv4('127.0.0.1', 57895);

console.log(ip);

console.log(bencode.encode(new Buffer(ip, 'binary')));