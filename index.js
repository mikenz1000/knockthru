var fs = require('fs');
var UglifyJS = require("uglify-js");

module.exports = function(app,suppliedOptions) {

	// process options and defaults
	var options = require('./options')(suppliedOptions);
		
	// load meanify
	if (options.predicates)
		options.meanify.filter = options.predicates;

	// disable transformation of the model name
	options.meanify.pluralize = false;
	options.meanify.lowercase = false;
	options.meanify.path = options.basePath;

	var meanify = require('./meanify-fork/meanify.js')(options.meanify);
	app.use(meanify());

	// get the javascript
	var fn = require('path').resolve(__dirname + '/knockthru.js');
	fs.readFile(fn, function(err, buffer) {
		// replace our special strings
		var js = buffer.toString();

		// minify if necessary
		if (options.minify)
			js = UglifyJS.minify(js, {fromString:true}).code;
			
		// and serve
		var url = options.basePath + options.jsname;
		if (options.verbose) console.log('Serving knockthru javascript at ' + url);
		app.get(url, function(req,res) {
			res.set('Content-Type', 'application/javascript');
			res.send(js);
		});
	});
	
	
}
