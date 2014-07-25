// Native requires

// package.json requires
var bencode = require('bencode');
var _ = require('lodash');

// Local requires
var common = require('./../tools/common');
var Database = require('./../tracker/database');
var Peer = require('./../tools/peer');
var Response = require('./../tools/response');

var database = new Database();

exports.index = function(req, res) {
    res.render('index', {title: 'AniDex Tracker', torrents: [], peers: []});
};

exports.announce = function(req, res) {
    var info_hash = common.descramble(req.param('info_hash'));
    var peer_id = common.descramble(req.param('peer_id'));
    var ip = req.param('ip') || req.connection.remoteAddress;
    var port = parseInt(req.param('port'));
    var compact = parseInt(req.param('compact')) || 1;
    var no_peer_id = parseInt(req.param('no_peer_id')) || 0;
    var numwant = parseInt(req.param('numwant')) || 50;
    var uploaded = req.param('uploaded') || 0;
    var downloaded = req.param('downloaded') || 0;
    var left = req.param('left');

    res.header('Content-Type', 'text/plain');

    if (info_hash === '') {
        res.end(common.bencodeFailure(101, 'info_hash is required'), 'binary');
        return;
    }

    if (peer_id === '') {
        res.end(common.bencodeFailure(102, 'peer_id is required'), 'binary');
        return;
    }

    if (port === NaN) {
        res.end(common.bencodeFailure(103, 'port is required'), 'binary');
        return;
    }

    if (info_hash.length != 40) {
        console.log(info_hash);
        res.end(common.bencodeFailure(150, 'info_hash is not the correct lenght'), 'binary');
        return;
    }

    if (peer_id.length != 40) {
        console.log(peer_id);
        res.end(common.bencodeFailure(151, 'peer_id is not the correct length'), 'binary');
        return;
    }

    if (numwant > 200) {
        numwant = 200;
    }

    var peer = new Peer(peer_id, info_hash, numwant, compact, ip, port, uploaded, downloaded, left);

    switch (req.param('event')) {
        case 'completed':
            // Peer is now a seeder.
            console.log('Leecher: ' + peer.peer_id + ' completed download of: ' + peer.info_hash);
            database.completePeer(peer, function(err, response) {
                if (err) {
                    throw err;
                } else {
                    res.end(response, 'binary');
                }
            });
            break;
        case 'stopped':
            // No longer seeding or leeching.
            if (peer._left == 0) {
                console.log('Peer: ' + peer.peer_id + ' left swarm as seeder for torrent: ' + peer.info_hash);
            } else {
                console.log('Peer: ' + peer.peer_id + ' left swarm as leecher for torrent: ' + peer.info_hash);
            }
            database.removePeer(peer, function(err, response) {
                if (err) {
                    throw err;
                } else {
                    res.end(response, 'binary');
                }
            });
            break;
        case 'started':
            // New seeder or leecher entered swarm.
            if (peer._left == 0) {
                console.log('Peer: ' + peer.peer_id + ' entered swarm as seeder for torrent: ' + peer.info_hash);
            } else {
                console.log('Peer: ' + peer.peer_id + ' entered swarm as leecher for torrent: ' + peer.info_hash);
            }

            console.log('Peer information: ');
            console.log(peer);

            database.addPeer(peer, function(err, response) {
                if (err) {
                    throw err;
                } else {
                    res.end(response, 'binary');
                }
            });
            break;
        default:
            // Update event.
            console.log('Peer: ' + peer.peer_id + ' update event for: ' + peer.info_hash);
            database.updatePeer(peer, function(err, response) {
                if (err) {
                    throw err;
                } else {
                    console.log(bencode.decode(response));
                    res.end(response, 'binary');
                }
            });
            break;
    }
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