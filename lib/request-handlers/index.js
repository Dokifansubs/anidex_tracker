var bencode = require('bencode');
var _ = require('lodash');
var net = require('net');

var common = require('./../helpers/common');
var Peer = require('./../helpers/peer');
var PeerInfo = require('./../helpers/peerInfo');
var Response = require('./../helpers/response');

var database = {};

var generatePeer = function(req) {
    var info_hash = common.descramble(req.param('info_hash')) || '';
    var peer_id = common.descramble(req.param('peer_id')) || '';
    var ip = req.param('ip') || req.connection.remoteAddress;
    ip = net.isIPv4(ip) ? ip : null;

    var ipv6 = req.param('ipv6') || req.connection.remoteAddress;
    ipv6 = net.isIPv6(ipv6) ? ipv6 : null;

    var port = parseInt(req.param('port')) || '';
    var compact = parseInt(req.param('compact')) || 1;
    var no_peer_id = parseInt(req.param('no_peer_id')) || 0;
    var numwant = parseInt(req.param('numwant')) || 50;
    var uploaded = req.param('uploaded') || 0;
    var downloaded = req.param('downloaded') || 0;
    var left = req.param('left') || 1;

    if (numwant > 200) {
        numwant = 200;
    }

    var peer_info = new PeerInfo(uploaded, downloaded, left);
    var peer = new Peer(peer_id, info_hash, ip, ipv6, port, peer_info, numwant, compact);
    peer.event = req.param('event');
    peer.queryStart = process.hrtime();
    return peer;
};

var completePeer = function(peer, res) {
    if (!peer.canComplete()) {
        // Peer already completed download.
        console.log('EVENT TRANSFER: COMPLETED -> UPDATE');
        return updatePeer(peer, res);
    }

    database.completePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            var diff = process.hrtime(peer.queryStart);
            console.log('Peer complete took %d ns', diff[0] * 1e9 + diff[1]);
            res.end(response, 'binary');
        }
    });
}

var stopPeer = function(peer, res) {
    if (!peer.canStop()) {
        console.log('Returning peers only to ' + peer.peer_id);
        // Peer wasn't in database to begin with.
        // Return peers anyway (required by some clients).
        return database.getPeersOnly(peer, function(err, response) {
            if (err) {
                res.end(common.bencodeFailure(900, 'database failure'), 'binary');
            } else {
                var diff = process.hrtime(peer.queryStart);
                console.log('Peers only took %d ns', diff[0] * 1e9 + diff[1]);
                res.end(response, 'binary');
            }
        });
    }

    database.removePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            var diff = process.hrtime(peer.queryStart);
            console.log('Peer stop took %d ns', diff[0] * 1e9 + diff[1]);
            res.end(response, 'binary');
        }
    });
}

var startPeer = function(peer, res) {
    if (!peer.canStart()) {
        // Peer already in database.
        console.log('EVENT TRANSFER: STARTED -> UPDATE');
        return updatePeer(peer, res);
    }

    database.addPeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            var diff = process.hrtime(peer.queryStart);
            console.log('Peer start took %d ns', diff[0] * 1e9 + diff[1]);
            res.end(response, 'binary');
        }
    });
}

var updatePeer = function(peer, res) {
    if (!peer.canUpdate()) {
        // In case peers don't send start event.
        console.log('EVENT TRANSFER: UPDATE -> STARTED');
        return startPeer(peer, res);
    }

    if (peer.canComplete()) {
        // In case peers don't send complete event.
        console.log('EVENT TRANSFER: UPDATE -> COMPLETE');
        return completePeer(peer, res);
    }

    database.updatePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            var diff = process.hrtime(peer.queryStart);
            console.log('Peer update took %d ns', diff[0] * 1e9 + diff[1]);
            res.end(response, 'binary');
        }
    });
}

var processPeer = function(err, peer, res) {
    if (err) {
        return res.end(common.bencodeFailure(900, 'database failure'), 'binary');
    }
    switch (peer.event) {
        case 'completed': completePeer(peer, res); break;
        case 'stopped': stopPeer(peer, res); break;
        case 'started': startPeer(peer, res); break;
        default: updatePeer(peer, res); break;
    }
};

exports.init = function(db) {
    database = db;
};

exports.announce = function(req, res) {
    var peer = generatePeer(req);

    res.header('Content-Type', 'text/plain');

    if (peer.info_hash == '') {
        return res.end(common.bencodeFailure(101, 'info_hash is required'), 'binary');
    }

    if (peer.peer_id == '') {
        return res.end(common.bencodeFailure(102, 'peer_id is required'), 'binary');
    }

    if (peer.port == NaN) {
        return res.end(common.bencodeFailure(103, 'port is required'), 'binary');
    }

    if (peer.info_hash.length != 40) {
        return res.end(common.bencodeFailure(150, 'info_hash is not the correct length'), 'binary');
    }

    if (peer.peer_id.length != 40) {
        return res.end(common.bencodeFailure(151, 'peer_id is not the correct length'), 'binary');
    }

    database.getPeer(peer, res, processPeer);
};

exports.scrape = function(req, res) {
    var info_hash = {};
    if (Array.isArray(req.param('info_hash'))) {
        info_hash = _.map(req.param('info_hash'), function(item) {
            return common.descramble(item);
        });
    } else {
        info_hash = common.descramble(req.param('info_hash'));
    }
    res.header('Content-Type', 'text/plain');
    database.scrape(info_hash, function(err, response) {
        if (err) {
            throw err;
        } else {
            res.end(response.bencodeScrape(), 'binary');
        }
    });
};