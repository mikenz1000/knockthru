module.exports = function(options)
{
	// if we didn't supply options, provide the defaults
	var defaultOptions = {
		// whether output is sent to the console by the javascript client
		verbose: true,
		
		// whether the js file is minified before being served
		minify: false,
		
		// the path at which the meanify endpoints AND knockthru.js file are hosted
		basePath: '/kt/',

		// the path for the js file to be used by the client, relative to basePath
		jsname: 'knockthru.js',
			
		// this is a function returning a key-value dictionary (taking request parameter), or a static key-value dictionary, of the
		// filters that will be applied to ALL datastore queries.  prevents url hackers from accessing other users' files etc
		filter: null,	
		
		// this is an express function taking parameters req,res,next that will be registered as a before handler for the 
		// ajax endpoints
		before: null,	

		// this should be a function accepting arguments req,model
		// req is the express request object
		// model is the 
		predicates: null,


		// these are the options to pass through to meanify
		// the most common will be predicates, which can also be supplied directly
		// some will be overridden by knockthru (lowercase=false,pluralise=false)
		meanify: {}				
	}
	if (options) for (var attrname in options) { defaultOptions[attrname] = options[attrname]; }
	options = defaultOptions;
	
	// ensure meanifyPath ends with slash
	if (options.basePath.charAt(options.basePath.length - 1) !== '/') {
		options.basePath = options.basePath + '/';
	}
	
	// processs options
	if (options.filter)
		options._filterFunc = (typeof(options.filter) === 'function') ? options.filter : function(req) { return options.filter; };
	else
		options._filterFunc = function(req) { return null; };
	return options;
}