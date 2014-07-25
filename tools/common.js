// package.json requires.
var bencode = require('bencode');

/*
 * Encode string en hex format
 * @param str String to encode.
 * @return Encoded string.
 */
var hexEncode = exports.hexEncode = function(str) {
    return new Buffer(str, 'binary').toString('hex');
};

// Decodes the strings received from peers.
var urlDecode = exports.urlDecode = function(str) {
    return unescape(str.replace(new RegExp('\\+','g'), ' '))
};

// Not sure what this does, but it's needed!
exports.descramble = function(str) {
    if (str == '' || typeof(str) === 'undefined') {
        return '';
    }
    return hexEncode(urlDecode(str)).toLowerCase();
};

var hexZerofill = exports.hexZerofill = function(str, fill) {
    while (str.length < fill) {
        // Hello genius future programmer, don't change this to '+='
        // because you think it looks cooler, because that will break it!
        str = '0' + str;
    }

    return str;
}

exports.hexEncodeIPv4 = function(ip, port) {
    var ipHex = ip.split('.').map(function(value) {
        return hexZerofill(parseInt(value).toString(16), 2);
    });
    port = hexZerofill(port.toString(16), 4);

    return (ipHex.join('') + port);
}

// Returns a bencode string that contains the error message.
exports.bencodeFailure = function(code, message) {
    return bencode.encode({
        'failure code': code,
        'failure reason': message
    });
};