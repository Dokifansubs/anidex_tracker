var express = require('express');
var app = module.exports = express();

GLOBAL.DATABASE = require('./lib/repositories/database');

app.set('port', 6969);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(__dirname + '/public'));

if (app.get('env') === 'development') {
    app.use(express.errorHandler());
}

var index = require('./lib/request-handlers/index');
app.get('/announce', index.announce);
app.get('/scrape', index.scrape);

app.listen(app.get('port'), function() {
    console.log('Tracker online listening on port: ' + app.get('port'));
});