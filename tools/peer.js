var mysql = require('mysql');

// Creates new Peer object that can be used to return proper SQL query strings.
function Peer(peer_id, info_hash, numwant, compact, ip, port, uploaded, downloaded, left) {
    this.id = peer_id + info_hash;
    this.peer_id = peer_id;
    this.info_hash = info_hash;
    this.numwant = numwant;
    this._compact = compact;
    this.ip = ip;
    this._port = port;
    this.uploaded = uploaded;
    this.downloaded = downloaded;
    this._left = left;
};

// Returns proper string to insert into SQL query to add peer to database.
Peer.prototype.toAddPeerString = function() {
    var string = mysql.escape(this.id) + ','
        + mysql.escape(this.peer_id) + ','
        + mysql.escape(this.info_hash) + ','
        + mysql.escape(this.ip) + ','
        + mysql.escape(this._port) + ','
        + mysql.escape(this.uploaded) + ','
        + mysql.escape(this.downloaded) + ','
        + mysql.escape(this._left);

    return string;
};

// Returns proper string to insert into SQL query to update peer in database.
Peer.prototype.toUpdatePeerString = function() {
    var string = mysql.escape(this.uploaded) + ','
        + mysql.escape(this.downloaded) + ','
        + mysql.escape(this._left);

    return string;
};

module.exports = Peer;