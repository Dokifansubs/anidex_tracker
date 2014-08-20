Peer.prototype.canUpdate = function() {
    return this.stored != null;
}

Peer.prototype.canStop = function() {
    return this.stored != null;
}

Peer.prototype.canStart = function() {
    return this.stored == null;
}

Peer.prototype.canComplete = function() {
    if (this.stored == null) {
        // Can't complete peers that haven't started.
        return false;
    }
    return (this.info.left == 0 && this.stored.left != 0);
}

function Peer(peer_id, info_hash, ip, ipv6, port, peer_info, numwant, compact) {
    this.id = peer_id + info_hash;
    this.peer_id = peer_id;
    this.info_hash = info_hash;
    this.ip = ip;
    this.ipv6 = ipv6;
    this.port = port;
    this.info = peer_info;
    this.stored = null;
    this.numwant = numwant;
    this.compact = compact;
};

module.exports = Peer;