var common = require('./../lib/helpers/common');
var bencode = require('bencode');

var ip = common.hexEncodeIPv4('127.0.0.1', 57895);
var ipv6 = common.hexEncodeIPv6('fe80::6203:8ff:fea4:9cc', 6881);

var ipv62 = common.hexEncodeIPv6('::1:', 6831);

console.log(new Buffer('2d5554333331302d41751d1ff4658788c033f66a', 'hex').toString());

console.log(ip);
console.log(ipv6);
console.log(ipv62);
console.log(bencode.encode(new Buffer(ip, 'binary')));
console.log(bencode.encode(new Buffer(ipv6, 'binary')));