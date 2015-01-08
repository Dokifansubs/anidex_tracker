var bencode = require('bencode');
var _ = require('lodash');
var net = require('net');

var common = require('./../helpers/common');
var Peer = require('./../helpers/peer');
var PeerInfo = require('./../helpers/peerInfo');
var Response = require('./../helpers/response');

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
    return peer;
};

var returnError = function(error_number, res) {
	switch(error_number) {
		case 200: res.end(common.bencodeFailure(200, 'Torrent not in database.'), 'binary'); break
		case 900: res.end(common.bencodeFailure(900, 'Database failure'), 'binary'); break;
		default: res.end(common.bencodeFailure(900, 'General failure'), 'binary'); break;
	}
}

var returnPeers = function(peer, res) {
    DATABASE.getPeers(peer, function(err, response) {
        if (err) {
            returnError(900, res);
        } else {
            res.end(response, 'binary');
        }
    });
};

var stopPeer = function(peer, res) {
    returnPeers(peer, res);

    if (!peer.canStop()) { return; }

    DATABASE.removePeer(peer, function(err, response) {
        if (err) {
            returnError(900, res);
        } else {
            res.end(response, 'binary');
        }
    });
};

var startPeer = function(peer, res) {
    if (!peer.canStart()) {
        // Peer already in DATABASE.
        return updatePeer(peer, res);
    }

    DATABASE.addPeer(peer, function(err, response) {
		if (err) {
			if (err.errno === 1452) {
				returnError(200, res);
			} else {
				returnError(900, res);
			}
		} else {
			returnPeers(peer, res);
		}
	});
};

var updatePeer = function(peer, res) {
    if (!peer.canUpdate()) {
        // In case peers don't send start event.
        return startPeer(peer, res);
    }

    returnPeers(peer, res);

    DATABASE.updatePeer(peer, function(err, response) {});
};

var processPeer = function(err, peer, res) {
    if (err) {
        return returnError(900, res);
    }

    switch (peer.event) {
        case 'stopped': stopPeer(peer, res); break;
        case 'started': startPeer(peer, res); break;
        default: updatePeer(peer, res); break;
    }
};

exports.announce = function(req, res) {
    var peer = generatePeer(req);

    res.header('Content-Type', 'text/plain');

    if (peer.info_hash === '') {
        return res.end(common.bencodeFailure(101, 'info_hash is required'), 'binary');
    }

    if (peer.peer_id === '') {
        return res.end(common.bencodeFailure(102, 'peer_id is required'), 'binary');
    }

    if (peer.port === NaN) {
        return res.end(common.bencodeFailure(103, 'port is required'), 'binary');
    }

    if (peer.info_hash.length !== 40) {
        return res.end(common.bencodeFailure(150, 'info_hash is not the correct length'), 'binary');
    }

    if (peer.peer_id.length !== 40) {
        return res.end(common.bencodeFailure(151, 'peer_id is not the correct length'), 'binary');
    }
	
    DATABASE.getPeer(peer, res, processPeer);
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
    DATABASE.scrape(info_hash, function(err, response) {
        if (err) {
            throw err;
        } else {
            res.end(response.bencodeScrape(), 'binary');
        }
    });
};