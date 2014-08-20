var fs = require('fs');
var mysql = require('mysql');
var _ = require('lodash');

var Response = require('./../helpers/response');
var common = require('./../helpers/common');
var PeerInfo = require('./../helpers/peerInfo');
var mysqlconf = require('./../../conf/mysql.json');

var scrape = exports.scrape = function(info_hash, callback) {
    if (Array.isArray(info_hash)) {
        info_hash = info_hash.join(',');
    }

    var query = 'SELECT `info_hash`, `complete`, `incomplete`, `downloaded` '
        + 'FROM `torrent` '
        + 'WHERE `info_hash` IN (?)';

    var arguments = [info_hash];

    connection.query(query, arguments, function(err, rows, fields) {
        if (err) {
            return callback(err, null);
        }

        var response = new Response();
        rows.forEach(function(item) {
            response.addScrape(item);
        });
        return callback(null, response);
    });
};

// Removes peers from database whose last update is more than 1 hour.
var flushPeers = function() {
    // Delete all peers whose last update is more than 1 hour ago.
    connection.query('SELECT `id`, `peer_id`, `info_hash`, `left` '
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `last_update` < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
        , function(err, rows, fields) {
            rows.forEach(function(item) {
                var field = '';
                // If peer had 0 bytes left to download, it was a seeder.
                if (item.left == 0) {
                    field = '`complete`' ;
                } else {
                    field = '`incomplete`';
                }
                // TODO: Convert to transaction.
                connection.query('UPDATE `nodetracker`.`torrent` '
                    + 'SET ' + field + ' = ' + field + ' - 1 '
                    + 'WHERE `info_hash` = ' + this.connection.escape(item.info_hash) + ' '
                    + 'AND ' + field + ' > 0'
                    , function(err, result) {
                        console.log('Decremented ' + field + ' on ' + item.info_hash);
                });
                connection.query('DELETE FROM `nodetracker`.`peers` '
                    + 'WHERE `id` = ' + this.connection.escape(item.id)
                    , function(err, result) {
                        console.log('Removed peer ' + item.peer_id + ' for torrent: ' + item.info_hash);
                });
            });
    });
};

// Adds peer to database or returns error if the torrent is not tracked.
// NOTE: failure codes are optional, but included anyway. Can be removed
// for bandwidth saving.
exports.addPeer = function(peer, callback) {
    var field = peer.info.left == 0 ? 'complete' : 'incomplete';

    var uQuery = 'UPDATE `torrent` '
        + 'SET `' + field + '` = `' + field + '` + 1 '
        + 'WHERE `info_hash` = ?';

    var uArguments = [peer.info_hash];

    var rQuery = 'REPLACE '
        + 'INTO `peers` (`id`, `peer_id`, `info_hash`, `ip`, `ipv6`, `port`, `uploaded`, `downloaded`, `left`) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

    var rArguments = [peer.id, peer.peer_id, peer.info_hash, peer.ip, peer.ipv6, peer.port, peer.info.up, peer.info.down, peer.info.left];

    connection.beginTransaction(function(err) {
        connection.query(uQuery, uArguments, function(err, result) {
            if (result.affectedRows == 0) {
                return connection.rollback(function() {
                    callback(null, common.bencodeFailure(200, 'Torrent not in database.'));
                });
            }
            connection.query(rQuery, rArguments, function(err, result) {
                getPeers(peer, callback);
            });
        });
    });
};

// Removes peer from database.
exports.removePeer = function(peer, callback) {
    var dQuery = 'DELETE FROM `peers` '
        + 'WHERE `id` = ?';

    var dArguments = [peer.id];

    var field = peer.info.left == 0 ? 'complete' : 'incomplete';

    var rQuery = 'UPDATE `torrent` '
        + 'SET `' + field + '` = `' + field + '` - 1 '
        + 'WHERE `info_hash` = ? '
        + 'AND `' + field + '` > 0';


    var rArguments = [peer.info_hash];

    connection.beginTransaction(function(err) {
        connection.query(dQuery, dArguments, function(err, result) {
            connection.query(rQuery, rArguments, function(err, results) {
                getPeers(peer, callback);
            });
        });
    });
};

// Increments the completed count for torrent.
// TODO: Clients can spam complete count and it will keep increasing,
// should add check to prevent clients with left=0 from sending complete
// (or just add completed boolean)
exports.completePeer = function(peer, callback) {
    var cQuery = 'UPDATE `torrent` '
        + 'SET `downloaded` = `downloaded` + 1, '
        + '`incomplete` = `incomplete` - 1, '
        + '`complete` = `complete` + 1 '
        + 'WHERE `info_hash` = ?';

    var cArguments = [peer.info_hash];
    connection.beginTransaction(function(err) {
        connection.query(cQuery, cArguments, function(err, result) {
            if (err) {
                return connection.rollback(function() {
                    callback(err, null);
                });
            }
            return updatePeer(peer, callback);
        });
    });
};

// Updates the peer in the database.
var updatePeer = exports.updatePeer = function(peer, callback) {
    var uQuery = 'UPDATE `peers` '
        + 'SET `uploaded` = ?, '
        + '`downloaded` = ?, '
        + '`left` = ? '
        + 'WHERE `id` = ?';

    var uArguments = [peer.info.up, peer.info.down, peer.info.left, peer.id];

    // Begin transation.
    connection.beginTransaction(function(err) {
        connection.query(uQuery, uArguments, function(err, result) {
            // Grab peers.
            getPeers(peer, callback);
        });
    });
};

exports.getPeersOnly = function(peer, callback) {
    connection.beginTransaction(function(err) {
        getPeers(peer, callback);
    });
}

// Returns a randomly ordered set of peers to the client.
// NOTE: Tracker supports compact and non-compact, however non-compact
// NOTE: getPeers must be called while inside a transation.
// requires more bandwidth.
var getPeers = function(peer, callback) {
    var gQuery = 'SELECT `peer_id`, `ip`, `ipv6`, `port` '
        + 'FROM `peers` '
        + 'WHERE `info_hash` = ? '
        + 'AND `peer_id` != ? '
        + 'ORDER BY RAND() '
        + 'LIMIT ?';

    var gArguments = [peer.info_hash, peer.peer_id, peer.numwant];

    // TODO: Maybe create a smarter algorithm?
    // Return a certain high download : low download distribution.
    connection.query(gQuery, gArguments, function(err, rows, fields) {
        if (err) {
            return callback(err, null);
        }
        scrape(peer.info_hash, function(err, response) {
            // Add all peers to response!
            rows.forEach(function(item) {
                response.addPeer(item);
            });
            connection.commit(function(err) {
                // Error?
                if (err) {
                    return connection.rollback(function() {
                        callback(err, null);
                    });
                }
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

exports.getPeer = function(peer, callback) {
    var query = 'SELECT `uploaded`, `downloaded`, `left` '
        + 'FROM `peers` '
        + 'WHERE `id` = ?'

    var arguments = [peer.id];

    connection.query(query, arguments, function(err, rows, fields) {
        if (err) {
            return callback(err, null);
        }

        if (rows.length == 1) {
            peer.stored = new PeerInfo(
                rows[0].uploaded,
                rows[0].downloaded,
                rows[0].left
            );
        }

        return callback(null, peer);
    });
}

var handleDisconnect = function() {
    connection.on('error', function(err) {
        if (!err.fatal) {
            return;
        }

        if (err.code !== 'PROTOCOL_CONNECTION_LOST') {
            throw err;
        }

        console.log('Reconnecting lost connection: ' + err.stack);
        delete connection;
        connection = mysql.createConnection(mysqlconf);
        handleDisconnect();
        connection.connect();
        connection.query('USE `nodetracker`', function(err, result) {
            // Nothing to do.
        });
    });
}


connection = mysql.createConnection(mysqlconf);
handleDisconnect();
connection.connect();
connection.query('USE `nodetracker`', function(err, result) {});
flushPeers();
setInterval(flushPeers, 1000 * 60 * 4);