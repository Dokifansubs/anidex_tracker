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
    var left = req.param('left') || 0;

    if (numwant > 200) {
        numwant = 200;
    }

    var peer_info = new PeerInfo(uploaded, downloaded, left);
    var peer = new Peer(peer_id, info_hash, ip, ipv6, port, peer_info, numwant, compact);
    peer.event = req.param('event');
    return peer;
};

var completePeer = function(peer, res) {
    if (!peer.canComplete()) {
        // Peer already completed download.
        return updatePeer(peer, res);
    }
    // Peer is now a seeder.
    console.log('Leecher: ' + peer.peer_id + ' completed download of: ' + peer.info_hash);

    database.completePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
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
                res.end(response, 'binary');
            }
        });
    }

    console.log('Peer: ' + peer.peer_id + ' stopped torrent: ' + peer.info_hash)

    database.removePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            res.end(response, 'binary');
        }
    });
}

var startPeer = function(peer, res) {
    if (!peer.canStart()) {
        // Peer already in database.
        return updatePeer(peer, res);
    }

    console.log('Peer: ' + peer.peer_id + ' started torrent: ' + peer.info_hash);

    database.addPeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
            res.end(response, 'binary');
        }
    });
}

var updatePeer = function(peer, res) {
    if (!peer.canUpdate()) {
        return startPeer(peer, res);
    }

    console.log('Peer: ' + peer_id + ' update torrent: ' + peer.info_hash);
    database.updatePeer(peer, function(err, response) {
        if (err) {
            res.end(common.bencodeFailure(900, 'database failure'), 'binary');
        } else {
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

    console.log(peer.peer_id);

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

    database.getPeer(peer, function(err, peer) {
        processPeer(err, peer, res);
    });
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