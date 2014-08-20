var common = require('./../lib/helpers/common');
var bencode = require('bencode');

var ip = common.hexEncodeIPv4('127.0.0.1', 57895);
var ipv6 = common.hexEncodeIPv6('fe80::6203:8ff:fea4:9cc', 6881);

console.log(ip);
console.log(ipv6);
console.log(bencode.encode(new Buffer(ip, 'binary')));
console.log(bencode.encode(new Buffer(ipv6, 'binary')));