// package.json requires.
var bencode = require('bencode');
var _ = require('lodash');

// local requires.
var common = require('./common');

function Response() {
    this.item = {};             // Single entry that has to be returned on announce.
    this.files = {};            // Files that are requested in the scrape request.
    this.failure_reason = {};   // Failure reason, only send this and code.
    this.warning_message = {};  // Warning message (Does not stop functionality) (OPTIONAL)
    this.interval = 1800;       // Suggested time to wait between announces, in seconds.
    this.min_interval = 10;     // Minimum time to wait between announces, in seconds. (OPTIONAL)
    this.tracker_id = {};       // This tracker's ID. TODO: Is this needed in all reponses? (OPTIONAL?)
    this.complete = {};         // Total number of seeders for this torrent.
    this.incomplete = {};       // Total number of leechers for this torrent.
    this.peers = [];            // List of peers with IPv4 or IPv6 addresses.
    this.flags = {};            // Flags (OPTIONAL)
};

// Adds a peer to the list of peers.
Response.prototype.addPeer = function(peer) {
    this.peers.push(peer);
};

// Returns a bencoded string that constains a list of peers.
Response.prototype.bencodePeers = function() {
    var peers4 = _.chain(this.peers)
        .filter(function(item) { return item.ip !== null; })
        .map(function(item) {
            var it = {};
            it.peer_id = item.peer_id;
            it.ip = item.ip;
            it.port = item.port;
            return it;
        })
        .value();
    var peers6 = _.chain(this.peers)
        .filter(function(item) { return item.ipv6 !== null; })
        .map(function(item) {
            var it = {};
            it.peer_id = item.peer_id;
            it.ipv6 = item.ipv6;
            it.port = item.port;
            return it;
        })
        .value();
    return this.bencode(peers4, peers6);
};

Response.prototype.bencode = function(peers, peers6) {
    return bencode.encode({
        'interval': this.interval,
        'complete': this.item.complete,
        'incomplete': this.item.incomplete,
        'downloaded': this.item.downloaded,
        'peers': peers,
        'peers6': peers6
    });
};

// Returns a bencoded string that constains a list of peers
// with a binary model of the IPv4 addresses (4 + 2 bytes)
Response.prototype.bencodePeersCompact = function() {
    var string4 = _.chain(this.peers)
        .filter(function(item) { return item.ip !== null; } )
        .map(function(item) { return common.hexEncodeIPv4(item.ip, item.port); } )
        .value()
        .join('');
    var buf4 = new Buffer(string4, 'hex');

    var string6 = _.chain(this.peers)
        .filter(function(item) { return item.ipv6 !== null; } )
        .map(function(item) { return common.hexEncodeIPv6(item.ipv6, item.port); } )
        .value()
        .join('');
    var buf6 = new Buffer(string6, 'hex');

    return this.bencode(buf4, buf6);
};

// Adds scrape info to the response.
Response.prototype.addScrape = function(item) {
    this.files[item.info_hash] = {
        'complete': item.complete,
        'downloaded': item.downloaded,
        'incomplete': item.incomplete
    };
    this.item = item;
};

// Returns a bencoded string that contains info for all files requested.
Response.prototype.bencodeScrape = function() {
    return bencode.encode({
        'files': this.files,
        'flags': this.flags
    });
};

module.exports = Response;