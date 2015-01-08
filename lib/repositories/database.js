var fs = require('fs');
var mysql = require('mysql');
var _ = require('lodash');

var Response = require('./../helpers/response');
var common = require('./../helpers/common');
var PeerInfo = require('./../helpers/peerInfo');
var MySQLConf = require('./../../conf/mysql.json');

var pool = {};

var scrape = exports.scrape = function(info_hash, callback) {
    if (Array.isArray(info_hash)) {
        info_hash = info_hash.join(',');
    }

    var query = 'SELECT `info_hash`, `seeders`, `leechers`, `completed` '
        + 'FROM `torrent_stats` '
        + 'WHERE `info_hash` IN (?)';

    var args = [info_hash];
	
	pool.getConnection(function(err, connection) {
		connection.query(query, args, function(err, rows, fields) {
			connection.release();
			if (err) {
				return callback(err, null);
			}
 
			var response = new Response();
			rows.forEach(function(item) {
				response.addScrape(item);
			});
			return callback(null, response);
		});		
	});
};

// Removes peers from database whose last update is more than 1 hour.
var flushPeers = function() {	
	var query = 'DELETE FROM `peers` WHERE `last_update` < (NOW() - INTERVAL 2 HOUR)';
	
	pool.getConnection(function(err, connection) {
		connection.query(query, function(err) {
			connection.release();
		});
	});
};

// Adds peer to database or returns error if the torrent is not tracked.
// NOTE: failure codes are optional, but included anyway. Can be removed
// for bandwidth saving.
exports.addPeer = function(peer, callback) {
    var query = 'REPLACE '
        + 'INTO `peers` (`id`, `peer_id`, `info_hash`, `ipv4`, `ipv6`, `port`, `uploaded`, `downloaded`, `left`) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

    var args = [peer.id, peer.peer_id, peer.info_hash, peer.ip, peer.ipv6, peer.port, peer.info.up, peer.info.down, peer.info.left];

	pool.getConnection(function(err, connection) {
		connection.query(query, args, function(err, result) {
			connection.release();
			callback(err, null);
		});		
	});
};

// Removes peer from database.
exports.removePeer = function(peer) {
    var query = 'DELETE FROM `peers` '
        + 'WHERE `id` = ?';

    var args = [peer.id];

    pool.getConnection(function(err, connection) {
        connection.query(query, args, function(err, result) {
            connection.release();
        });
    });
};

// Updates the peer in the database.
exports.updatePeer = function(peer, callback) {
    var query = 'UPDATE `peers` '
        + 'SET `uploaded` = ?, '
        + '`downloaded` = ?, '
        + '`left` = ?, '
        + 'WHERE `id` = ?';

    var args = [peer.info.up, peer.info.down, peer.info.left, peer.id];

	pool.getConnection(function(err, connection) {
		connection.query(query, args, function(err, result) {
			connection.release();
		});
	});
};

// Returns a randomly ordered set of peers to the client.
exports.getPeers = function(peer, callback) {
    var query = 'SELECT `peer_id`, `ipv4`, `ipv6`, `port` '
        + 'FROM `peers` '
        + 'WHERE `info_hash` = ? '
        + 'ORDER BY RAND() '
        + 'LIMIT ?';

    var args = [peer.info_hash, peer.numwant];

    // TODO: Maybe create a smarter algorithm?
    // Return a certain high download : low download distribution.
	pool.getConnection(function(err, connection) {
		connection.query(query, args, function(err, rows, fields) {
			connection.release();
			if (err) {
				return callback(err, null);
			}
			scrape(peer.info_hash, function(err, response) {
				// Add all peers to response!
				rows.forEach(function(item) {
					response.addPeer(item);
				});
				// Return response.
				if (peer.compact) {
					return callback(null, response.bencodePeersCompact());
				} else {
					return callback(null, response.bencodePeers());
				}
			});
		});		
	});
};

exports.getPeer = function(peer, res, callback) {
    var query = 'SELECT `peers`.`uploaded`, `peers`.`downloaded`, `peers`.`left` '
        + 'FROM `peers` '
        + 'WHERE `peers`.`id` = ?';

    var args = [peer.id];

	pool.getConnection(function(err, connection) {
		connection.query(query, args, function(err, rows, fields) {
			connection.release();
			if (rows.length === 1) {
				peer.stored = new PeerInfo(
					rows[0].uploaded,
					rows[0].downloaded,
					rows[0].left
				);
			}
			return callback(null, peer, res);
		});
	});
};

pool = mysql.createPool(MySQLConf);
flushPeers();
setInterval(flushPeers, 1000 * 60 * 4);