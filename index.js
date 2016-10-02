var fs = require('fs');
var UglifyJS = require("uglify-js");

module.exports = function(app,suppliedOptions) {

	// process options and defaults
	var options = require('./options')(suppliedOptions);
		
	var meanify = require('./meanify-fork/meanify.js')({
		pluralize: true,
		verbose:true
	});
	app.use(meanify());

	// get the javascript
	var fn = require('path').resolve(__dirname + '/knockthru.js');
	fs.readFile(fn, function(err, buffer) {
		// replace our special strings
		var js = buffer.toString();
		js = js.split("{{verbose}}").join(options.verbose == true);
		js = js.split("{{meanifyPath}}").join(options.meanifyPath);
		js = js.split("{{parseIdFunction}}").join(options.parseIdFunction);
		//console.log(js);
		// minify if necessary
		if (options.minify)
			js = UglifyJS.minify(js, {fromString:true}).code;
			
		// and serve
		if (options.verbose) console.log('Serving meanify-knockout javascript at ' + options.jsurl);
		app.get(options.jsurl, function(req,res) {
			res.set('Content-Type', 'application/javascript');
			res.send(js);
		});
	});
	
	
}
