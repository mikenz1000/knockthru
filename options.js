module.exports = function(options)
{
	// if we didn't supply options, provide the defaults
	var defaultOptions = {
		// whether output is sent to the console by the javascript client
		verbose: true,
		
		// whether the js file is minified before being served
		minify: false,
		
		// the path for the js file to be used by the client
		jsurl: '/knockthru.js',
		
		// the api base in meanify - this is the default value
		meanifyPath: '/',
		
		// this is the function what will return the _id value from the URL or session or wherever it should be gotten from, in the browser.
		// getUrlParameter is provided in the script automatically as a helper function to pull ?name=value from the url
		parseIdFunction: "function() { \n"+
            "return getUrlPathTail(); \n"+
			//return getUrlParameter('_id'); \
		"}\n",
		
		// this is a function returning a key-value dictionary (taking request parameter), or a static key-value dictionary, of the
		// filters that will be applied to ALL datastore queries.  prevents url hackers from accessing other users' files etc
		filter: null,	
		
		// this is an express function taking parameters req,res,next that will be registered as a before handler for the 
		// ajax endpoints
		before: null,					
	}
	if (options) for (var attrname in options) { defaultOptions[attrname] = options[attrname]; }
	options = defaultOptions;
	
	// ensure meanifyPath ends with slash
	if (options.meanifyPath.charAt(options.meanifyPath.length - 1) !== '/') {
		options.meanifyPath = options.meanifyPath + '/';
	}
	
	// processs options
	if (options.filter)
		options._filterFunc = (typeof(options.filter) === 'function') ? options.filter : function(req) { return options.filter; };
	else
		options._filterFunc = function(req) { return null; };
	return options;
}