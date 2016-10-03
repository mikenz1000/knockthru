var express = require('express');
var app = express();

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/test');
var Task = require('./task');

// ensure we have at least two tasks
Task.count(function(err,c) {
	if (c == 0) {
    Task.collection.insert([{description:"Task A"},{description:"Task B"}],function(err) { if (err) throw err; });	
  }
});

// serve up the html files as-is
app.use(express.static('html'));

// serve up the knockthru js client
require('../index.js')(app,
{
});

// create the server and run it
var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});
