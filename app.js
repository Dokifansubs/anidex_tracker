/*
 * native requires.
 */
var express = require('express');
var http = require('http');

/*
 * package.json requires.
 */


/*
 * local requires.
 */
var routes = require('./routes/index');

var app = module.exports = express();

app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('SECRET'));
    app.use(express.session());
    app.use(require('stylus').middleware({ src: __dirname + '/public' }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function() {
    app.use(express.errorHandler());
});

app.get('/announce', routes.announce);
app.get('/scrape', routes.scrape);
app.get('/', routes.index);

http.createServer(app).listen(6969);

console.log('Tracker online listening on port: 6969');