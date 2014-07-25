// package.json requires.
var bencode = require('bencode');
var _ = require('lodash');

// local requires.
var common = require('./../tools/common');

function Response() {
    this.item = {};             // Single entry that has to be returned on announce.
    this.files = {};            // Files that are requested in the scrape request.
    this.failure_reason = {};   // Failure reason, only send this and code.
    this.warning_message = {};  // Warning message (Does not stop functionality) (OPTIONAL)
    this.interval = 1800;       // Suggested time to wait between announces.
    this.min_interval = 10;     // Minimum time to wait between announces. (OPTIONAL)
    this.tracker_id = {};       // This tracker's ID. TODO: Is this needed in all reponses? (OPTIONAL?)
    this.complete = {};         // Total number of seeders for this torrent.
    this.incomplete = {};       // Total number of leechers for this torrent.
    this.peers = [];            // List of peers with IPv4 addresses.
    //this.peers6 = [];        // List of peers with IPv6 addresses. TODO: Implement this.
    this.flags = {};            // Flags (OPTIONAL)
};

// Adds a peer to the list of peers.
Response.prototype.addPeer = function(peer) {
    this.peers.push(peer);
};

// Returns a bencoded string that constains a list of peers
// with IPv4 addresses.
Response.prototype.bencodePeersIPv4 = function() {
    return this.bencodePeers(this.peers, []);
};

Response.prototype.bencodePeers = function(peers, peers6) {
    return bencode.encode({
        'interval': this.interval,
        'complete': this.item.complete,
        'incomplete': this.item.incomplete,
        'downloaded': this.item.downloaded,
        'peers': peers,
        'peers6': peers6
    });
}

// Returns a bencoded string that constains a list of peers
// with a binary model of the IPv4 addresses (4 + 2 bytes)
Response.prototype.bencodePeersIPv4Compact = function() {
    var string = _.map(this.peers, function(item) {
        return common.hexEncodeIPv4(item.ip, item.port);
    }).join('');
    var buf = new Buffer(string, 'hex');
    return this.bencodePeers(buf, '');
};

// Adds scrape info to the response.
Response.prototype.addScrape = function(item) {
    this.files[item.info_hash] = {
        'complete': item.complete,
        'downloaded': item.downloaded,
        'incomplete': item.incomplete
    }
    this.item = item;
};

// Returns a bencoded string that contains info for all files requested.
Response.prototype.bencodeScrape = function() {
    return bencode.encode({
        'files': this.files,
        'flags': this.flags
    });
}

module.exports = Response;