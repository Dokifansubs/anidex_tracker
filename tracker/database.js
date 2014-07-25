// Native requires.
var fs = require('fs');

// package.json requires.
var mysql = require('mysql');
var _ = require('lodash');

// Local requires.
var Response = require('./../tools/response');
var common = require('./../tools/common');
var mysqlconf = require('./../conf/mysql.json');

// Removes peers from database whose last update is more than 1 hour.
Database.prototype.flushPeers = function() {
    console.log('Flushing peers');
    // Delete all peers whose last update is more than 1 hour ago.
    this.connection.query('SELECT `id`, `peer_id`, `info_hash`, `left` '
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
                this.connection.query('UPDATE `nodetracker`.`torrent` '
                    + 'SET ' + field + ' = ' + field + ' - 1 '
                    + 'WHERE `info_hash` = ' + this.connection.escape(item.info_hash) + ' '
                    + 'AND ' + field + ' > 0'
                    , function(err, result) {
                        console.log('Decremented ' + field + ' on ' + item.info_hash);
                });
                this.connection.query('DELETE FROM `nodetracker`.`peers` '
                    + 'WHERE `id` = ' + this.connection.escape(item.id)
                    , function(err, result) {
                        console.log('Removed peer ' + item.peer_id + ' for torrent: ' + item.info_hash);
                });
            }.bind(this));
    }.bind(this));
};

Database.prototype.checkTorrent = function(peer, callback) {
    this.connection.query('SELECT * FROM `nodetracker`.`torrent` '
        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
        , function(err, rows, fields) {
            if (err) {
                callback(err);
            } else if (rows.length == 0) {
                callback(new Error('Torrent not found'));
            } else {
                callback(undefined);
            }
    }.bind(this));
};

// Adds peer to database or returns error if the torrent is not tracked.
// NOTE: failure codes are optional, but included anyway. Can be removed
// for bandwidth saving.
Database.prototype.addPeer = function(peer, callback) {
    this.checkTorrent(peer, function(err) {
        if (err) {
            callback(undefined, common.bencodeFailure(200, 'Torrent not in database.'));
        } else  {
            this.transaction(peer, callback);
        }
    }.bind(this));
};

// Transaction to add a peer.
Database.prototype.transaction = function(peer, callback) {
    this.connection.beginTransaction(function(err) {
        this.connection.query('REPLACE '
            + 'INTO `nodetracker`.`peers` (`id`, `peer_id`, `info_hash`, `ip`, `port`, `uploaded`, `downloaded`, `left`) '
            + 'VALUES (' + peer.toAddPeerString() + ')'
            , function(err, result) {
                if (err) {
                    this.connection.rollback(function() {
                        callback(err, undefined);
                    });
                } else {
                    // TODO: lol fix that it doesn't update every cycle.
                    var field = '';
                    if (peer._left == 0) {
                        field = '`complete`';
                    } else {
                        field = '`incomplete`';
                    }
                    this.connection.query('UPDATE `nodetracker`.`torrent` '
                        + 'SET ' + field + ' = ' + field + ' + 1 '
                        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
                        , function(err, result) {
                            if (err) {
                                this.connection.rollback(function() {
                                    callback(err, undefined);
                                });
                            } else {
                                this.connection.commit(function(err) {
                                    if (err) {
                                        this.connection.rollback(function() {
                                            callback(err, undefined);
                                        })
                                    } else {
                                        this.getPeers(peer, callback);
                                    }
                                }.bind(this));
                            }
                    }.bind(this));
                }
        }.bind(this));
    }.bind(this));
};

// Removes peer from database.
Database.prototype.removePeer = function(peer, callback) {
    this.connection.query('SELECT `id`, `peer_id`, `info_hash`, `left` '
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `id` = ' + this.connection.escape(peer.peer_id + peer.info_hash)
        , function(err, rows, fields) {
            if (err) {
                callback(err, undefined);
            } else {
                // TODO: Convert this to a function. (Also used by flushPeers)
                rows.forEach(function(item) {
                    var field = '';
                    if (item.left == 0) {
                        field = '`complete`' ;
                    } else {
                        field = '`incomplete`';
                    }
                    this.connection.query('UPDATE `nodetracker`.`torrent` '
                        + 'SET ' + field + ' = ' + field + ' - 1 '
                        + 'WHERE `info_hash` = ' + this.connection.escape(item.info_hash) + ' '
                        + 'AND ' + field + ' > 0'
                        , function(err, result) {
                            console.log('Decremented ' + field + ' on ' + item.info_hash);
                    });
                    this.connection.query('DELETE FROM `nodetracker`.`peers` '
                        + 'WHERE `id` = ' + this.connection.escape(item.id)
                        , function(err, result) {
                            console.log('Removed peer ' + item.peer_id + ' for torrent: ' + item.info_hash);
                    });
                    this.getPeers(peer, callback);
                }.bind(this));
            }
    }.bind(this));
};

// Increments the completed count for torrent.
// TODO: Clients can spam complete count and it will keep increasing,
// should add check to prevent clients with left=0 from sending complete
// (or just add completed boolean)
Database.prototype.completePeer = function(peer, callback) {
    this.connection.query('UPDATE `nodetracker`.`torrent` '
        + 'SET `downloaded` = `downloaded` + 1, '
        + '`incomplete` = `incomplete` - 1, '
        + '`complete` = `complete` + 1 '
        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
        , function(err, result) {
            if (err) {
                callback(err, undefined);
            } else {
                this.updatePeer(peer, callback);
            }
    }.bind(this));
};

// Updates the peer in the database.
// TODO: uTorrent doesn't send "started" when it resumes from paused/stopped state
// only when it restarts. Peer could have been deleted from database when it resumes.
Database.prototype.updatePeer = function(peer, callback) {
    this.connection.query('UPDATE `nodetracker`.`peers` '
        + 'SET `uploaded` = ' + this.connection.escape(peer.uploaded) + ', '
        + '`downloaded` = ' + this.connection.escape(peer.downloaded) + ', '
        + '`left` = ' + this.connection.escape(peer._left) + ' '
        + 'WHERE `id` = ' + this.connection.escape(peer.peer_id + peer.info_hash)
        , function(err, result) {
            if (err) {
                callback(err, undefined);
            } else {
                this.getPeers(peer, callback);
            }

    }.bind(this));
};

// Returns a randomly ordered set of peers to the client.
// NOTE: Tracker supports compact and non-compact, however non-compact
// requires more bandwidth.
Database.prototype.getPeers = function(peer, callback) {
    var colums = '`ip`, `port` ';
    if (peer._compact === 0) {
        colums = '`peer_id`, ' + colums;
    }

    // TODO: Maybe create a smarter algorithm?
    // Return a certain high download : low download distribution.
    this.connection.query('SELECT ' + colums
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash) + ' '
        + 'AND `peer_id` != ' + this.connection.escape(peer.peer_id) + ' '
        + 'ORDER BY RAND() '
        + 'LIMIT ' + this.connection.escape(peer.numwant)
        , function(err, rows, result) {
            if (err) {
                callback(err, undefined);
                return;
            }
            this.scrape(peer.info_hash, function(err, response) {
                if (err) {
                    callback(err, undefined);
                } else {
                    // Add all peers to response!
                    rows.forEach(function(item) {
                        response.addPeer(item);
                    });
                    // Return hex IPv4 if client requested compact.
                    if (peer._compact) {
                        callback(undefined, response.bencodePeersIPv4Compact());
                    } else {
                        callback(undefined, response.bencodePeersIPv4());
                    }
                }
            }.bind(this));
    }.bind(this));
};

Database.prototype.scrape = function(info_hash, callback) {
    if (Array.isArray(info_hash)) {
        info_hash = _.map(info_hash, function(item) {
            return this.connection.escape(item);
        }.bind(this))
        info_hash = info_hash.join(',');
    } else {
        info_hash = this.connection.escape(info_hash);
    }

    this.connection.query('SELECT `info_hash`, `complete`, `incomplete`, `downloaded` '
        + 'FROM `nodetracker`.`torrent` '
        + 'WHERE `info_hash` IN (' + info_hash + ')'
        , function(err, rows, fields) {
            if (err) {
                callback(err, undefined);
                return;
            }
            var response = new Response();
            rows.forEach(function(item) {
                response.addScrape(item);
            });
            callback(undefined, response);
    });
};

function Database() {
    this.connection = mysql.createConnection(mysqlconf);

    this.connection.connect();
    // Clear out expired peers.
    this.flushPeers();
    // Set interval to clear expired peers.
    setInterval(this.flushPeers.bind(this), 1000 * 60 * 4);
}

module.exports = Database;