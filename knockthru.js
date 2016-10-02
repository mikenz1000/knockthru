/*  This is the JS that is called by the client to databind the meanify scrud services to knockout viewmodels automatically

	Usage 
	
	<script src='/knockthru.js'></script>
	...
	<div data-knockthru='<modelname>,<search/create/update>[,option:readonly]'>
		<p data-bind='foreach: items'>
		...
		</p>
	</div>
	
	Note that special strings {{verbose}} and {{meanifyPath}} are replaced with the relevant options when this file is loaded
	
	Use the model name that meanify is publishing on the endpoints (if the pluralize option is passed, add an s to the lowercase model name...)
*/
var verbose = {{verbose}};
var parseId = {{parseIdFunction}};

// ensure we have jQuery
if (!window.jQuery) throw new Error("jQuery must be included - add this to the html head section:\n"+
"	<script src='http://code.jquery.com/jquery-1.11.0.min.js'></script>");
	
// ensure we have knockout
if (typeof ko === "undefined") throw new Error("Knockout must be included - add this to the html head section:\n"+
"	<script src='https://cdnjs.cloudflare.com/ajax/libs/knockout/3.3.0/knockout-min.js' ></script>\n");
if (!ko.mapping) throw new Error("Knockout.mapping must be included - add this to the html head section:\n"+
"	<script src='https://cdnjs.cloudflare.com/ajax/libs/knockout.mapping/2.4.1/knockout.mapping.min.js' ></script>");

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

// for getting the URL	
function getUrlParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null;
}
// returns the last part of the path (an alternative way of finding the id)
function getUrlPathTail() {
    return location.pathname.substr(location.pathname.lastIndexOf('/') + 1);
}
var viewmodels = {};

// read,modelname/{scriptvar} - read single record
// searchedit,modelname[?field1=value1,...] - search for records
// search,modelname[?field1=value1,...] - search for records
// create,modelname/{scriptvar} - write single record
var re = /([^,]+),([^?/]+)([/?])?(.*)?/;

// find all the viewmodel targets
$(document).ready(function() {
$("[data-knockthru]").each(function() {
	var target = $(this);
    
	var params = target.attr("data-knockthru").match(re);
    var action = params[1];
	var modelname = params[2];
    var operatorAfterModelName = params[3];
    var afterOperator = params[4];
	var readonly = action == 'searchreadonly';
	if (action == 'searchreadonly') action = 'search';
	//params.some(function(p) { p === "option:readonly"});
	var viewmodel = {};
	var viewmodelKey = modelname + ',' + action; // used to uniquely identify the viewmodel
	if (viewmodels[viewmodelKey])
	{
		// already done the viewmodel for this model and action - recycle it for the additional DOM element
		ko.applyBindings(viewmodels[viewmodelKey], target[0]);
		return;
	}
	viewmodels[viewmodelKey] = viewmodel;
	var modelApiBase = "{{meanifyPath}}" + modelname;
	var applyBindings = function() {
	try {
			ko.applyBindings(viewmodel, target[0]);	
		} catch (e) {
			if (e.message.indexOf("multiple times to the same element") > 0) throw new Error("Multiple knockout viewmodels are being applied to the "+
			"element identified by " + target[0].id + ".  Check you haven't got one viewmodel target enclosed within another");
			else throw e;
		}
	};
	viewmodel.errors = ko.observableArray([]);
	
    // GET modelname[?fields] - search for records
	if (action == 'search')
	{
		viewmodel.items = ko.mapping.fromJS([]);
		if (!readonly) {
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
					if (verbose) console.log("POSTing to UPDATE: " + json);
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
							viewmodel.errors.push(getMeanifyError(jqXHR));							
							next();
						}) 
					});
					// launch operations
					viewmodel.startOperations();
				});
				viewmodel.deleted().forEach(function(item)
				{
					var data = ko.mapping.toJS(item);
					if (verbose) console.log("DELETING: " + data);
					viewmodel.operations.push(function(next) {
						$.ajax({type: "DELETE",url:modelApiBase+'/'+data._id})
						.done(function(result) {
							// remove
							viewmodel.deleted.remove(item);
							next();
						})
						.fail(function(jqXHR) { 
							// add error
							viewmodel.errors.push(getMeanifyError(jqXHR));							
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
					if (verbose) console.log("POSTing to CREATE: " + json);
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
							viewmodel.errors.push(getMeanifyError(jqXHR));							
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
		} // if readonly
		var firstcall = true;
		viewmodel.refresh = function(next) { 
            var url = modelApiBase;
            if (operatorAfterModelName == '?')
            {
                url = url + '?';
                afterOperator.split('&').forEach(function (pair) 
                    {
                        var split = pair.split('=');
                        if (split[1].substring(0,1) == '{')
                        {
                            var code = split[1].substring(1,split[1].length-1);
                            var value = eval(code);
                            console.log('Evaluated ' + code + ' as ' + value);
                            split[1] = value;
                        }
                        else split[1] = decodeURIComponent(split[1]);
                        url += split[0] + '=' + encodeURIComponent(split[1]);
                    });
            }
			$.get(url, function(data, status, xhr, dataType) {
                if (!(xhr.getResponseHeader('content-type').startsWith('application/json'))) throw new Error("Did not receive JSON from endpoint: " + url + ". Make sure the settings path in meanify and meanifyPath in knockthru match, and that nothing else could be handling this url as well.");
				ko.mapping.fromJS(data, mappingOptions, viewmodel.items);
				viewmodel.deleted([]);
				viewmodel.created([]);
				viewmodel.errors([]);
				if (firstcall) applyBindings();
				firstcall = false;
				if (next) next();
			});
		};
		viewmodel.refresh();
        viewmodel.createItem = {};
        addCreateItem(viewmodel.createItem,modelApiBase,operatorAfterModelName,afterOperator,applyBindings,modelname,false);

	}
	
	// CREATE
	// create a dummy model so we have all the fields and properties
	// var blank = model.blank;
	else if (action == 'create') {
		addCreateItem(viewmodel,modelApiBase,operatorAfterModelName,afterOperator,applyBindings,modelname,true);
	}
	
	else if (action == 'read')
	{
		//var id = parseId();
		var code = afterOperator.substring(1,afterOperator.length-1);
		var id = eval(code);
		console.log('Evaluated ' + code + ' as ' + id);
		
		viewmodel.error = ko.observable(null);
		var firstcall = true;
		viewmodel.refresh = function() { 
			$.get(modelApiBase + '/' + id, function(data) {
				if (firstcall) viewmodel.item = ko.mapping.fromJS(data, mappingOptions);
				else ko.mapping.fromJS(data, mappingOptions, viewmodel.item);
				if (firstcall) applyBindings();
				firstcall = false;
			});
		};
		viewmodel.submitUpdate = function() {
			var data = ko.mapping.toJS(viewmodel.item);
			var json = JSON.stringify(data);
			if (verbose) console.log("POSTing to UPDATE: " + json);
			$.ajax({type: "POST",url:modelApiBase+'/'+data._id,data:json, 
					contentType:"application/json; charset=utf-8",dataType:"json"})
				.done(function(result) {
					// clear dirty flag
					viewmodel.item.isDirty(false);
					viewmodel.error(null);
				})
				.fail(function(jqXHR) { 
					viewmodel.error(getMeanifyError(jqXHR));						
				});
		}
		viewmodel.submitDelete = function () {
			var data = ko.mapping.toJS(viewmodel.item);
			if (verbose) console.log("DELETING: " + data);
			$.ajax({type: "DELETE",url:modelApiBase+'/'+data._id})
				.done(function(result) {
					// redirect to... ???
				})
				.fail(function(jqXHR) { 
					viewmodel.error(getMeanifyError(jqXHR));							
				});
		}
		
		viewmodel.refresh();
	}
	else throw new Error("Don't know how to handle action: " + target.attr("data-knockthru"));
	
	
	
});
});

function getMeanifyError(jqXHR)
{
	try {
		var resp = JSON.parse(jqXHR.responseText);
	} catch (e) {
		// if the response isn't JSON, just return it as text
		return jqXHR.responseText;
	}
	if (verbose) console.log(resp);	
	if (resp.errors && resp.errors.description) return resp.errors.description.message;
	else return jqXHR.responseText;
}

function addCreateItem(viewmodel,modelApiBase,operatorAfterModelName,afterOperator,applyBindings,modelname,
    doApplyBindings)
{
    var blank = null;
		// run the query to get the blank
		$.ajax({type: "POST",url:modelApiBase})
			.done(function(data) { 
                blank = data;
                // apply any other pre-set values
                if (operatorAfterModelName=='?')
                {
                    afterOperator.split('&').forEach(function (pair) 
                    {
                        var split = pair.split('=');
                        if (split[1].substring(0,1) == '{')
                        {
                            var code = split[1].substring(1,split[1].length-1);
                            var value = eval(code);
                            console.log('Evaluated ' + code + ' as ' + value);
                            split[1] = value;
                        }
                        blank[decodeURIComponent(split[0])] = 
                            split[1];  
                    });
                }
				viewmodel.item = ko.mapping.fromJS(blank, mappingOptions);
				if (doApplyBindings) applyBindings();
			})
			.fail(function(jqXHR, textStatus) { 
				viewmodel.error("Failed to read blank endpoint for metadata: " + jqXHR.responseText); 
			});
		viewmodel.error = ko.observable(null);
		viewmodel.submitCreate = function() { 
			if (verbose) console.log("POSTing to CREATE: " + ko.mapping.toJSON(viewmodel.item));
			$.ajax({type: "POST",url:modelApiBase,data:ko.mapping.toJSON(viewmodel.item),
				contentType:"application/json; charset=utf-8",dataType:"json"})
			.done(function(data) { 
				// if we succeed, expect no data just reset the form
				ko.mapping.fromJS(blank, mappingOptions, viewmodel.item);
				
				// and if we detect a search on the same form, refresh it automatically
				var search = $("[data-knockthru^='search,"+modelname+"']");
				if (search.length > 0) 
                {
                    search = ko.dataFor(search[0]);
				    if (search) search.refresh();
                }
			})
			.fail(function(jqXHR, textStatus) { 
				viewmodel.error(jqXHR.responseText); 
			});
		}
		viewmodel.addToSearch = function() { 
			var search = $("[data-knockthru^='search,"+modelname+"']");
			if (search.length == 0) throw new Error("Could not find SEARCH viewmodel (an element with attribute data-knockthru='"+modelname+",search')");
			search = ko.dataFor(search[0]);
			var newItem = ko.mapping.fromJS(ko.mapping.toJS(viewmodel.item),mappingOptions);
			search.items.push(newItem);
			search.created.push(newItem);
			// and reset the input form
			ko.mapping.fromJS(blank, mappingOptions, viewmodel.item);			
		};
}