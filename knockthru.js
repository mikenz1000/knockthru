/*  This is the JS that is called by the client to databind the meanify scrud services to knockout viewmodels automatically

	Usage 
	
	<script src='/kt/knockthru.js'></script>
	...
	<div data-knockthru='kt.search(<modelname>[,filters])'>
		<p data-bind='foreach: items'>
		...
		</p>
	</div>

	See the README.md for full details
*/

// INFRASTRUCTURE

// find the path to this script, which is also the base path for the meanify endpoints
var scripts = document.getElementsByTagName("script");
var script = scripts[scripts.length-1];
var basePath = script.src.replace('knockthru.js','');

// ensure we have jQuery
if (!window.jQuery) throw new Error("jQuery must be included - add this to the html head section:\n"+
"	<script src='http://code.jquery.com/jquery-1.11.0.min.js'></script>");
	
// ensure we have knockout
if (typeof ko === "undefined") throw new Error("Knockout must be included - add this to the html head section:\n"+
"	<script src='https://cdnjs.cloudflare.com/ajax/libs/knockout/3.3.0/knockout-min.js' ></script>\n");
if (!ko.mapping) throw new Error("Knockout.mapping must be included - add this to the html head section:\n"+
"	<script src='https://cdnjs.cloudflare.com/ajax/libs/knockout.mapping/2.4.1/knockout.mapping.min.js' ></script>");

// KNOCKOUT ENHANCEMENTS

// Define the dirtyFlag function which returns true if the root is modified
ko.dirtyFunc = function (root) { 
	// store the initial state
	var _initialState = ko.observable(ko.mapping.toJSON(root));
   	var func = ko.computed({
		   read: function () { 
			   return  _initialState() !== ko.mapping.toJSON(root); 
		   },
		   write: function(value) {
			   if (value == false) _initialState(ko.mapping.toJSON(root));
			   else throw new Error("dirtyFunc:write called with a value other than false: " + value);			
		   },
		   owner: root});
	return func;
};

// mapping options that will add the isDirty function to any item in the viewmodel
var mappingOptions = { 
	create: function(opts) { 
		var result = ko.mapping.fromJS(opts.data);
		result.isDirty = ko.dirtyFunc(result);
		return result;
	}
};

// Define a knockout binding for content which lets you get two-way databinding on contenteditable html tags like span
if (!ko.bindingHandlers.content)
	ko.bindingHandlers.content = {
		init: function(element, valueAccessor, allBindingsAccessor) {
			ko.utils.registerEventHandler(element, "keyup", function() {
				var modelValue = valueAccessor();
				var elementValue = element.innerHTML;
				if (ko.isWriteableObservable(modelValue)) {
					modelValue(elementValue);
				}
				else { //handle non-observable one-way binding
					var allBindings = allBindingsAccessor();
					if (allBindings['_ko_property_writers'] && allBindings['_ko_property_writers'].htmlValue) allBindings['_ko_property_writers'].htmlValue(elementValue);
				}
			}
										)
		},
		update: function(element, valueAccessor) {
			var value = ko.utils.unwrapObservable(valueAccessor()) || "";
			if (element.innerHTML !== value) {
				element.innerHTML = value;
			}
		}
	};

// define an onEnterKey binding 
if (!ko.bindingHandlers.onEnterKey) 
	ko.bindingHandlers.onEnterKey = {
		init: function (element, valueAccessor, allBindings, viewModel) {
			var callback = valueAccessor();
			$(element).keypress(function (event) {
				var keyCode = (event.which ? event.which : event.keyCode);
				if (keyCode === 13) {
					callback.call(viewModel);
					return false;
				}
				return true;
			});
		}
	};

// KNOCKTHRU

// The namespace - kt
var kt = kt || {};

// Utility for getting querystring parameters, intended to be used for passing parameters to the viewmodel functions
// e.g. <div class="container" data-knockthru='kt.read("Task", kt.getUrlParameter("_id"))'>	
kt.getUrlParameter = function (name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
}

// Returns the last part of the path in case you want to pick up parameters from the path
// If you're using this then you need to set the web server to serve up the page for all matching urls accordingly
// e.g. If the url was "http://host/tasks/1234" then it would return 1234
// e.g. <div class="container" data-knockthru='kt.read("Task", kt.getUrlPathTail())'>	
kt.getUrlPathTail = function () {
    return location.pathname.substr(location.pathname.lastIndexOf('/') + 1);
}

// By default, not verbose. Override in page script.
kt.verbose = false;

// Our container for private functions (they'll be accessible but we just want to steer developers towards the 
// non private ones if they are able to browse the namespace
kt.private = {};

// PRIVATE KNOCKTHRU STUFF

// util function to describe an element to the developer so that they can find it
// inspired by http://stackoverflow.com/questions/5728558/get-the-dom-path-of-the-clicked-a
kt.private.getDomPath = function (el) {
  var stack = [];
  while ( el.parentNode != null ) {
    console.log(el.nodeName);
    var sibCount = 0;
    var sibIndex = 0;
    for ( var i = 0; i < el.parentNode.childNodes.length; i++ ) {
      var sib = el.parentNode.childNodes[i];
      if ( sib.nodeName == el.nodeName ) {
        if ( sib === el ) {
          sibIndex = sibCount;
        }
        sibCount++;
      }
    }
    if ( el.hasAttribute('id') && el.id != '' ) {
      stack.unshift(el.nodeName.toLowerCase() + '#' + el.id);
	} else if (el.hasAttribute('class') && el.class != '') {
      stack.unshift(el.nodeName.toLowerCase() + '.' + el.class);		
    } else if ( sibCount > 1 ) {
      stack.unshift(el.nodeName.toLowerCase() + ':eq(' + sibIndex + ')');
    } else {
      stack.unshift(el.nodeName.toLowerCase());
    }
    el = el.parentNode;
  }

  return stack.slice(1); // removes the html element
}

// Applybindings method used to give more user friendly message if the developer falls into a common pitfall
kt.private.applyBindings = function(viewmodel,targetOverride) {
try {
		if (!targetOverride) targetOverride = kt.private.target[0];
		console.log('binding ' + kt.private.getDomPath(targetOverride));
		ko.applyBindings(viewmodel, targetOverride);	
	} catch (e) {
		if (e.message.indexOf("multiple times to the same element") > 0) throw new Error("Multiple knockout viewmodels are being applied to the "+
		"element identified by " + kt.private.getDomPath(targetOverride) + ".  Check you haven't got one viewmodel target enclosed within another");
		else throw e;
	}
};

// Extract a meaningful error from the meanify response
kt.private.getMeanifyError = function(jqXHR)
{
	try {
		var resp = JSON.parse(jqXHR.responseText);
	} catch (e) {
		// if the response isn't JSON, just return it as text
		if (jqXHR.status == 404) return '404 - not found\n' + jqXHR.responseText;
		else if (jqXHR.status == 400) return '400 - invalid request\n' + jqXHR.responseText;
		return jqXHR.responseText;
	}
	if (kt.verbose) console.log(resp);	
	if (resp.errors && resp.errors.description) return resp.errors.description.message;
	else return jqXHR.responseText;
}

// As opposed to validation errors and business logic errors returned from the server
// using ajax calls and rendered to the viewmodel.error observable for display in the UI,
// this method is called when more fundamental errors occur like record not found
// (which shouldn't happen)
kt.private.systemError = function(message)
{
	console.error(message);
}

// In both the search viewmodels and of course the create viewmodel we want to have a 'blank' data item
// to bind to
kt.private.addCreateItem = function (viewmodel,modelApiBase,filter,modelname,doApplyBindings)
{
	// since we do callbacks store the target on the stack so that it can be used by the callback
	var target = kt.private.target[0];
    var blank = null;

	// run the query to get the blank
	$.ajax({type: "POST",url:modelApiBase})
		.done(function(data) { 
			blank = data;
			// apply any other pre-set values
			if (filter)
			{
				for (var f in filter)
					blank[f] = filter[f];                    
			}
			viewmodel.item = ko.mapping.fromJS(blank, mappingOptions);
			if (doApplyBindings) kt.private.applyBindings(viewmodel,target);
		})
		.fail(function(jqXHR, textStatus) { 
			viewmodel.error("Failed to read blank endpoint for metadata: " + jqXHR.responseText); 
		});
	viewmodel.error = ko.observable(null);
	viewmodel.submitCreate = function() { 
		if (kt.verbose) console.log("POSTing to CREATE: " + ko.mapping.toJSON(viewmodel.item));
		$.ajax({type: "POST",url:modelApiBase,data:ko.mapping.toJSON(viewmodel.item),
			contentType:"application/json; charset=utf-8",dataType:"json"})
		.done(function(data) { 
			// if we succeed, expect no data just reset the form
			ko.mapping.fromJS(blank, mappingOptions, viewmodel.item);
			
			// and if we detect a search on the same form, refresh it automatically
			for (var s in kt.private.searches)
				s.refresh();
		})
		.fail(function(jqXHR, textStatus) { 
			viewmodel.error(jqXHR.responseText); 
		});
	}
	viewmodel.addToSearch = function(index) {			
		if (!index) index = 0;
		return function()
		{
			var search = kt.private.searches[index];
			if (!search) throw new Error("Could not find SEARCH viewmodel");
			var newItem = ko.mapping.fromJS(ko.mapping.toJS(viewmodel.item),mappingOptions);
			search.items.push(newItem);
			search.created.push(newItem);
			// and reset the input form
			ko.mapping.fromJS(blank, mappingOptions, viewmodel.item);
		}			
	};
}

// Once the DOM has loaded, find all the viewmodel targets
$(document).ready(function() {
	$("[data-knockthru]").each(function() {

		// store the target in a 'global' in our namespace that we will pick up later when binding the viewmodels
		// if browser javascript were multithreaded this would need to done using thread local storage
		kt.private.target = $(this);

		// you read a lot of bad stuff about the eval() function but this makes things very nice and concise
		// security-wise it's not more dangerous than the <script> tag, since the developer decides what's passed
		// in the attribute value.
		var code = kt.private.target.attr("data-knockthru");

		// we expect the code to be a function that sets up a viewmodel for the target
		// like kt.search()
		// alternatively if there is a return value then we attempt to bind it (e.g. if we pull the viewmodel from somewhere else)
		eval(code);
	});
});

// the kt.getSearch function allows additional bindings to the same search viewmodel that was defined earlier in the html page
// it's also used by the addToSearch function to refresh the search viewmodel when you use the create model to submit a new one
kt.private.searches = [];

// THE KNOCKTHRU VIEWMODEL FUNCTIONS

// Used to return a previously created search viewmodel
kt.getSearch = function(index)
{
	if (!index) index = 0;
	kt.private.applyBindings(kt.private.searches[index],kt.private.target[0]);
}

// a read-only search of the data - this is a key method, see README.md
kt.search = function(modelname, filter)
{
	var viewmodel = {};
	var modelApiBase = basePath + modelname;
	var firstcall = true;
	kt.private.searches.push(viewmodel);
	viewmodel.errors = ko.observableArray([]);
	viewmodel.items = ko.mapping.fromJS([]);

	// copy the target variable to the stack since it will be referenced in a callback
	var target = kt.private.target[0];
	viewmodel.refresh = function() { 
		var url = modelApiBase;
		if (filter)
		{
			url = url + '?';
			for (var f in filter)
				url += encodeURIComponent(f) + '=' + encodeURIComponent(filter[f]);
		}
		$.get(url, function(data, status, xhr, dataType) {
			if (!(xhr.getResponseHeader('content-type').startsWith('application/json'))) throw new Error("Did not receive JSON from endpoint: " + url + ". Make sure the settings path in meanify and meanifyPath in knockthru match, and that nothing else could be handling this url as well.");
			ko.mapping.fromJS(data, mappingOptions, viewmodel.items);
			viewmodel.errors([]);
			if (firstcall) kt.private.applyBindings(viewmodel,target);
			firstcall = false;
		});
	};
	viewmodel.refresh();
	viewmodel.createItem = {};
	kt.private.addCreateItem(viewmodel.createItem,modelApiBase,filter,modelname,false);
};

// a search that provides the ability to edit 'in page' and submit all changes at the end
kt.searchEdit = function(modelname, filter)
{
	var viewmodel = {};
	kt.private.searches.push(viewmodel);
	var modelApiBase = basePath + modelname;
	viewmodel.errors = ko.observableArray([]);
	viewmodel.items = ko.mapping.fromJS([]);
	
	viewmodel.deleted = ko.observableArray([]);
	viewmodel.created = ko.observableArray([]);
	viewmodel.delete = function(data) {
		if (viewmodel.created.indexOf(data) >= 0)
		{
			// unsaved so remove from created list
			viewmodel.created.remove(data);
		}
		else
		{
			viewmodel.deleted.push(data);	
		}
		viewmodel.items.remove(data);
	}
	viewmodel.updated = ko.computed(function () { 
		return ko.utils.arrayFilter(viewmodel.items(), function (i) { 
			return i.isDirty(); 
		});
	});
	
	// outstanding ajax operations are here - each is a function to be called that takes a callback as a parameter which will 
	// be called when done (pass or fail) and schedule the next.  It's observable so you can have a UI element bound to operations().length or something
	viewmodel.operations = ko.observableArray([]);
	viewmodel.startOperations = function() {
		if (viewmodel.operations().length > 0)
		{
			var o = viewmodel.operations.shift();
			o(viewmodel.startOperations); // will trigger another one if one remains when done
		}
	};
	viewmodel.submit = function() {
		viewmodel.errors([]);
		viewmodel.updated().forEach(function(item)
		{
			var data = ko.mapping.toJS(item);
			var json = JSON.stringify(data);
			if (kt.verbose) console.log("POSTing to UPDATE: " + json);
			viewmodel.operations.push(function(next) {
				$.ajax({type: "POST",url:modelApiBase+'/'+data._id,data:json, 
					contentType:"application/json; charset=utf-8",dataType:"json"})
				.done(function(result) {
					// clear dirty flag
					item.isDirty(false);
					next();
				})
				.fail(function(jqXHR) { 
					// add error
					viewmodel.errors.push(kt.private.getMeanifyError(jqXHR));							
					next();
				}) 
			});
			// launch operations
			viewmodel.startOperations();
		});
		viewmodel.deleted().forEach(function(item)
		{
			var data = ko.mapping.toJS(item);
			if (kt.verbose) console.log("DELETING: " + data);
			viewmodel.operations.push(function(next) {
				$.ajax({type: "DELETE",url:modelApiBase+'/'+data._id})
				.done(function(result) {
					// remove
					viewmodel.deleted.remove(item);
					next();
				})
				.fail(function(jqXHR) { 
					// add error
					viewmodel.errors.push(kt.private.getMeanifyError(jqXHR));							
					next();
				}) 
			});
			// launch operations
			viewmodel.startOperations();
		});
		viewmodel.created().forEach(function(item)
		{
			var data = ko.mapping.toJS(item);
			var json = JSON.stringify(data);
			if (kt.verbose) console.log("POSTing to CREATE: " + json);
			viewmodel.operations.push(function(next) {
				$.ajax({type: "POST",url:modelApiBase,data:json, 
					contentType:"application/json; charset=utf-8",dataType:"json"})
				.done(function(result) {
					// clear dirty flag
					viewmodel.created.remove(item);
					item._id = result._id;
					next();
				})
				.fail(function(jqXHR) { 
					viewmodel.errors.push(kt.private.getMeanifyError(jqXHR));							
					next();
				});
			});
			// launch operations
			viewmodel.startOperations();
		});
	} // submit;
	viewmodel.isDirty = ko.computed(function() {
		return (viewmodel.created().length +
				viewmodel.updated().length +
				viewmodel.deleted().length) > 0;
	});
	
	var firstcall = true;
	var target = kt.private.target[0];
	viewmodel.refresh = function() { 
		var url = modelApiBase;
		if (filter)
		{
			url = url + '?';
			for (var f in filter)
				url += encodeURIComponent(f) + '=' + encodeURIComponent(filter[f]);
		}
		$.get(url, function(data, status, xhr, dataType) {
			if (!(xhr.getResponseHeader('content-type').startsWith('application/json'))) throw new Error("Did not receive JSON from endpoint: " + url + ". Make sure that the meanify endpoint is what knockthru expects (only possible if you mess about with the options), and that nothing else could be handling this url as well.");
			ko.mapping.fromJS(data, mappingOptions, viewmodel.items);
			viewmodel.deleted([]);
			viewmodel.created([]);
			viewmodel.errors([]);
			if (firstcall) kt.private.applyBindings(viewmodel,target);
			firstcall = false;
			
		});
	};
	viewmodel.refresh();
	viewmodel.createItem = {};
	kt.private.addCreateItem(viewmodel.createItem,modelApiBase,filter,modelname,false);
};

// the create viewmodel
kt.create = function(modelname,predicate)
{	
	var viewmodel = {};
	var modelApiBase = basePath + modelname;
	viewmodel.errors = ko.observableArray([]);

	// CREATE
	// create a dummy model so we have all the fields and properties
	// var blank = model.blank;
	kt.private.addCreateItem(viewmodel,modelApiBase,predicate,modelname,true);
};

// read provides a viewmodel with a single 'item'
kt.read = function(modelname,id)
{	
	var viewmodel = {};
	var modelApiBase = basePath + modelname;
	//viewmodel.errors = ko.observableArray([]);
	
	var target = kt.private.target[0];

	viewmodel.error = ko.observable(null);
	var firstcall = true;
	viewmodel.refresh = function() { 
		
		$.ajax({type:"GET", url:modelApiBase + '/' + id, 
		contentType:'application/json; charset=utf-8',
		dataType:'json'})
		.done(function(data) {
			if (firstcall) viewmodel.item = ko.mapping.fromJS(data, mappingOptions);
			else ko.mapping.fromJS(data, mappingOptions, viewmodel.item);
			if (firstcall) kt.private.applyBindings(viewmodel,target);
			firstcall = false;
		})
		.fail(function(jqXHR) {
			kt.private.systemError(kt.private.getMeanifyError(jqXHR));
		});
	};
	viewmodel.submitUpdate = function() {
		var data = ko.mapping.toJS(viewmodel.item);
		var json = JSON.stringify(data);
		if (kt.verbose) console.log("POSTing to UPDATE: " + json);
		$.ajax({type: "POST",url:modelApiBase+'/'+data._id,data:json, 
				contentType:"application/json; charset=utf-8",dataType:"json"})
			.done(function(result) {
				// clear dirty flag
				viewmodel.item.isDirty(false);
				viewmodel.error(null);
			})
			.fail(function(jqXHR) { 
				viewmodel.error(kt.private.getMeanifyError(jqXHR));						
			});
	}
	viewmodel.submitDelete = function () {
		var data = ko.mapping.toJS(viewmodel.item);
		if (kt.verbose) console.log("DELETING: " + data);
		$.ajax({type: "DELETE",url:modelApiBase+'/'+data._id})
			.done(function(result) {
				// redirect to... ???
			})
			.fail(function(jqXHR) { 
				viewmodel.error(kt.private.getMeanifyError(jqXHR));							
			});
	}
	viewmodel.invoke = function(method) 
	{
		// since want to pass a parameter we need to create a functor for knockout to invoke
		return function() 
		{
			var data = ko.mapping.toJS(viewmodel.item);
			var json = JSON.stringify(data);
			if (kt.verbose) console.log("POSTing to METHOD " + method + ": " + json);
			$.ajax({type: "POST",url:modelApiBase+'/'+data._id+'/'+method,data:json, 
					contentType:"application/json; charset=utf-8",dataType:"json"})
				.done(function(result) {
					viewmodel.error(null);
					// did we get a redirect?
					if (result.alert) alert(result.alert);
					else if (result.error) viewmodel.error(result.error);
					else if (result.redirect) window.location = result.redirect;
					else viewmodel.error("Blank response");
					// clear dirty flag
					//viewmodel.item.isDirty(false);				
				})
				.fail(function(jqXHR) { 
					viewmodel.error(kt.private.getMeanifyError(jqXHR));						
				});
		}
	}
	
	viewmodel.refresh();
};

