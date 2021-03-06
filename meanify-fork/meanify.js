/* jshint node: true */
'use strict';
/*
	✔︎ DELETE /items/{id}
	✔︎ GET /items
	✔︎ GET /items/{id}
	✔︎ POST /items (blank body returns a blank record without writing to database)
	✔︎ PUT /items (optional)
	✔︎ PUT /items/{id}
	✔︎ POST /items/{id} (optional)
	TODO: https://github.com/mgonto/restangular
*/
var debug = require('debug')('meanify');
var express = require('express');
var mongoose = require('mongoose');
var pluralize = require('pluralize');
var parser = require('body-parser');

// mongoose.set('debug', true);

function Meanify(Model, options) {

	if (typeof Model === 'string') {
		Model = mongoose.model(Model);
	}

	var modelName = Model.modelName;
	var meanify = this;

	// Find geospatial index for geo queries.
	// http://docs.mongodb.org/manual/reference/operator/query/nearSphere/
	// https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#geojson-support-mongodb--24
	var indexes = Model.schema._indexes;
	var geoField;
	if (indexes) {
		indexes.forEach(function (indexes) {
			indexes.forEach(function (index) {
				for (var x in index) {
					if (index[x] === '2dsphere') {
						geoField = x;
						break;
					}
				}
			});
		});
	}

	// Enable relationship support on create/delete.
	if (options.relate) {
		var relationships = [];
		// TODO: Model.tree?
		var tree = Model.base.modelSchemas[modelName].tree;
		for (var property in tree) {

			// Alternative way of specifying Geospatial index.
			// https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#geojson-support-mongodb--24
			if (tree[property].index === '2dsphere') {
				geoField = property;
			}

			var schema = tree[property];
			if (Array.isArray(schema)) {
				schema = schema[0];
			}

			if (schema.ref) {
				var relatedModel = mongoose.model(schema.ref);
				// TODO: relatedModel.tree?
				var relatedTree = relatedModel.base.modelSchemas[schema.ref].tree;
				for (var relatedProperty in relatedTree) {

					var isArray = false;
					var relatedSchema = relatedTree[relatedProperty];
					if (Array.isArray(relatedSchema)) {
						isArray = true;
						relatedSchema = relatedSchema[0];
					}

					if (relatedSchema.ref === modelName) {
						// debug('Found related property: ', y);
						relationships.push({
							isArray: isArray,
							Model: Model,
							property: property,
							relatedModel: relatedModel,
							relatedProperty: relatedProperty
						});
					}
				}
			}
		}
	}

	// determine the filter function (passed req as a parameter, returns fields ALWAYS included in the filter for 
	// all db operations.  Allows you to restrict access to the objects that belong to a certain user etc.
	if (options.filter)
		options._filterFunc = (typeof(options.filter) === 'function') ? options.filter : function(req) { return options.filter; };
	else
		options._filterFunc = function(req) { return {}; };

	// this option determines how we test to be sure that a method is invokable
	if (!options.invokableMethodTest)
		options.invokableMethodTest = function(method) { return method["isWebInvokable"]; }

    var validId = function(id)
	{
		if (!id) return false;
		return /^[a-fA-F0-9]{24}$/.test(id);
	}
	
	meanify.search = function search(req, res, next) {
		// TODO: Use Model.schema.paths to check/cast types.
		var fields = req.query;
		var params = {};

		// Normalize count parameter.
		if (fields.hasOwnProperty('__count')) {
			fields.__count = true;
		}

		['count', 'populate', 'sort', 'skip', 'limit', 'near'].forEach(function (param) {
			params[param] = fields['__' + param];
			delete fields['__' + param];
		});

		if (params.near) {

			if (!geoField) {
				return next({
					'error': 'Geospatial Index Not Found',
					'message': 'http://docs.mongodb.org/manual/reference/operator/query/nearSphere/ --> The $nearSphere operator requires a geospatial index and can use either 2dsphere index or 2d index for location data defined as GeoJSON points or legacy coordinate pairs. To use a 2d index on GeoJSON points, create the index on the coordinates field of the GeoJSON object. To set index in Mongoose: // https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#geojson-support-mongodb--24'
				});
			}

			var coordinates = params.near.split(',')
				.map(function (item) {
					return parseFloat(item);
				});

			fields[geoField] = {
				$nearSphere: {
					$geometry: {
						type: 'Point',
						coordinates: coordinates
					}
				}
			};

			// Set max distance (meters) if supplied.
			if (coordinates.length === 3) {
				fields[geoField].$nearSphere.$maxDistance = coordinates.pop();
			}

		}

		// Support JSON objects for range queries, etc.
		var objRegex = /^{.*}$/;
		for (var field in fields) {
			var value = fields[field];
			if (objRegex.test(value)) {
				fields[field] = JSON.parse(value);
			}
		}
		
		// override with server-side filter field values
		applyFilter(req,fields,options,Model);
		
		var query = Model.find(fields);

		if (params.count) {
			query.count(function (err, data) {
				if (err) {
					debug('Search middleware query.count error:', err);
					return next(err);
				}
				return res.send([data]);
			});
		} else {
			if (params.limit) {
				query.limit(params.limit);
			}
			if (params.skip) {
				query.skip(params.skip);
			}
			if (params.sort) {
				query.sort(params.sort);
			}
			if (params.populate) {
				query.populate(params.populate);
			}
			query.exec(function (err, data) {
				if (err) {
					debug('Search middleware query error:', err);
					return next(err);
				}
				return res.send(data);
			});
		}
	};

	meanify.create = function create(req, res) {
		// on empty post, return blank object 
		if (Object.keys(req.body).length === 0) {
			return meanify.blank(req,res,null);
		}
		
		// override data with server-side filter field values
		applyFilter(req,req.body,options,Model);

		Model.create(req.body, function (err, data) {
			if (err) {
				return res.status(400).send(err);
			}

			// Populate relationships.
			if (options.relate) {
				// TODO: Finish relationships before sending response.
				relationships.forEach(function (relation) {

					var referenceId = data[relation.property];
					// Normalize to array.
					if (!Array.isArray(referenceId)) {
						referenceId = [ referenceId ];
					}

					referenceId.forEach(function (id) {
						var update = {};
						update[relation.relatedProperty] = data._id;
						relation.relatedModel.findByIdAndUpdate(id,
							relation.isArray ? { $addToSet: update } : update,
							function (err, data) {
								if (err) {
									debug('Relationship error:', err);
									debug('Failed to relate:',
										relation.relatedModel.modelName,
										relation.relatedProperty);
								}
								debug('Relationship success:', data);
							}
						);
					});

				});
			}

			return res.status(201).send(data);
		});
	};

	meanify.update = function update(req, res, next) {
		// override the _id selection with any other server-side filter field values
		var fields = { '_id': req.params.id };
		applyFilter(req,fields,options,Model);
		Model.findOne(fields, function (err, data) {
			if (err) {
				debug('Update middleware Model.findById error:', err);
				return next(err);
			}
			if (data) {
				// Update using simple extend.
				var filter = options._filterFunc(req,Model);
				for (var property in req.body) {

					// do not allow writes to fields covered by predicates/filters
					if (property in filter) continue;

					data[property] = req.body[property];
				}
				data.save(function (err) {
					if (err) {
						return res.status(400).send(err);
					}
					return res.status(204).send();
				});
			} else {
				return res.status(404).send();
			}
		});
	};

	// Instance Methods
	function instanceMethod(method) {
		return function (req, res, next) {
			if (req.params.id) {
				// override the _id selection with any other server-side filter field values
				var fields = { '_id': req.params.id };
				applyFilter(req,fields,options,Model);
				Model.findOne(fields, function (err, data) {
					if (err) {
						debug('Method middleware Model.findById error:', err);
						return next(err);
					}
					if (data) {
						// Update using simple extend.
						var filter = options._filterFunc(req,Model);
						for (var property in req.body) {

							// do not allow writes to fields covered by predicates/filters
							if (property in filter) continue;

							data[property] = req.body[property];
						}

						// this is awkward - quite a departure from meanify... the idea is that 
						// since our methods get invoked using ajax, we can't send the usual
						// redirects etc back
						var responseWrapper = {
							redirect: function(url) { res.send({redirect:url}); },
							alert: function(message) { res.send({alert:message}); },
							error: function(message) { res.status(500).send({error:message}); }
						};
						try {
							data[method](req, responseWrapper);
						} catch (e)
						{
							return responseWrapper.error(e.message);
						}
						// , function (err, data) {
						// 	if (err) {
						// 		return res.status(400).send(err);
						// 	}
						// 	return res.send(data);
						// });
					} else {
						return res.status(404).send("Object not found or inaccessible");
					}
				});
			} else {
				return res.status(404).send("id parameter not supplied");
			}
		};
	}
	var methods = Model.schema.methods;
	for (var method in methods) {
		// Not sure why meanify iterates Model.schem.methods twice, but I guess
		// might as well do the method test twice then. (Refactoring can happen after
		// the hypothetical merge of my changes)
		if (!options.invokableMethodTest(methods[method]))
			continue;
		meanify.update[method] = instanceMethod(method);
	}

	meanify.delete = function del(req, res, next) {
		if (req.params.id) {
			// override the _id selection with any other server-side filter field values
			var fields = { '_id': req.params.id };
			applyFilter(req,fields,options,Model);
			Model.findOneAndRemove(fields, function (err, data) {
				if (err) {
					debug('Delete middleware Model.findOneAndRemove error:', err);
					return next(err);
				}

				// Remove relationships.
				if (options.relate && data) {
					debug('Deleting:', data);
					// TODO: Finish deleting relationships before sending response.
					relationships.forEach(function (relation) {

						var referenceId = data[relation.property];
						// Normalize to array.
						if (!Array.isArray(referenceId)) {
							referenceId = [ referenceId ];
						}

						referenceId.forEach(function (id) {
							var update = {};
							update[relation.relatedProperty] = data._id;
							relation.relatedModel.findByIdAndUpdate(id,
								relation.isArray ? { $pull: update } : { $unset: update },
								function (err, data) {
									if (err) {
										debug('Relationship delete error:', err);
										debug('Failed to delete relation:',
											relation.relatedModel.modelName + '.' +
											relation.relatedProperty);
									}
									debug('Relationship delete success:', data);
								}
							);
						});

					});
				}

				if (data) {
					return res.status(204).send();
				} else {
					return res.status(404).send();
				}

			});

		} else {
			return res.status(404).send();
		}
	};

	meanify.read = function (req, res, next) {

		var populate = '';
		if (req.query.__populate) {
			populate = req.query.__populate;
			delete req.query.__populate;
		}

		if (validId(req.params.id)) {
			var fields = { '_id': req.params.id };
			applyFilter(req,fields,options,Model);
			Model.findOne(fields)
				.populate(populate)
				.exec(function (err, data) {
				if (err) {
					debug('Read middleware Model.findById error:', err);
					return next(err);
				}
				if (data) {
					// ensure all fields are populated with at least a null
					for (var f in Model.schema.paths)
					{
						if (typeof data[f] === "undefined")
							data[f] = null;
					}

					return res.send(data);
				} else {
					return res.status(404).send();
				}
			});
		} else {
			return res.status(404).send();
		}
	};

	function subdoc(field) {
		return {
			search: function (req, res, next) {
				if (req.params.id) {
					var fields = { '_id': req.params.id };
					applyFilter(req,fields,options,Model);
					Model.findOne(fields, function (err, parent) {
						if (err) {
							debug('Sub-document search middleware (' + field + ') Model.findById error:', err);
							return next(err);
						}
						if (parent) {
							// TODO: Research available advanced query options.
							// http://docs.mongodb.org/manual/tutorial/query-documents/#embedded-documents
							return res.send(parent[field]);
						} else {
							return res.status(404).send();
						}
					});
				} else {
					return res.status(404).send();
				}
			},
			create: function (req, res, next) {
				if (req.params.id) {
					var fields = { '_id': req.params.id };
					applyFilter(req,fields,options,Model);
					Model.findOne(fields, function (err, parent) {
						if (err) {
							debug('Sub-document create middleware (' + field + ') Model.findById error:', err);
							return next(err);
						}
						if (parent) {
							var index = parent[field].push(req.body) - 1;
							var child = parent[field][index];
							parent.save(function (err) {
								if (err) {
									return res.status(400).send(err);
								}
								return res.status(201).send(child);
							});
						} else {
							return res.status(404).send();
						}
					});
				} else {
					return res.status(404).send();
				}
			},
			read: function (req, res, next) {
				var subId = req.params[field + 'Id'];
				if (req.params.id) {
					var fields = { '_id': req.params.id };
					applyFilter(req,fields,options,Model);
					Model.findOne(fields, function (err, parent) {
						if (err) {
							debug('Sub-document read middleware (' + field + ') Model.findById error:', err);
							return next(err);
						}
						if (parent) {
							var child = parent[field].id(subId);
							if (child) {
								return res.send(child);
							} else {
								return res.status(404).send();
							}
						} else {
							return res.status(404).send();
						}
					});
				} else {
					return res.status(404).send();
				}
			},
			update: function (req, res, next) {
				var subId = req.params[field + 'Id'];
				if (req.params.id) {
					var fields = { '_id': req.params.id };
					applyFilter(req,fields,options,Model);
					Model.findOne(fields, function (err, parent) {
						if (err) {
							debug('Sub-document update middleware (' + field + ') Model.findById error:', err);
							return next(err);
						}
						if (parent) {
							var child = parent[field].id(subId);
							if (child) {
								// Update using simple extend.
								for (var property in req.body) {
									child[property] = req.body[property];
								}
								parent.save(function (err) {
									if (err) {
										return res.status(400).send(err);
									}
									return res.status(200).send(child);
								});
							} else {
								return res.status(404).send();
							}
						} else {
							return res.status(404).send();
						}
					});
				} else {
					return res.status(404).send();
				}
			},
			delete: function (req, res, next) {
				var subId = req.params[field + 'Id'];
				if (req.params.id) {
					var fields = { '_id': req.params.id };
					applyFilter(req,fields,options,Model);
					Model.findOne(fields, function (err, parent) {
						if (err) {
							debug('Sub-document delete middleware (' + field + ') Model.findById error:', err);
							return next(err);
						}
						if (parent) {
							parent[field].id(subId).remove();
							parent.save(function (err) {
								if (err) {
									return res.status(400).send(err);
								}
								return res.status(204).send();
							});
						} else {
							return res.status(404).send();
						}
					});
				} else {
					return res.status(404).send();
				}
			}
		};
	}

	var paths = Model.schema.paths;
	for (var field in paths) {
		var path = paths[field];
		if (path.schema) {
			meanify[field] = subdoc(field);
		}
	}
	
	// blank object used to databind to create forms
	var blankDocument = {};
	for (var path in Model.schema.paths)
	{
		// since we'd never need to bind these to the UI, let the defaults be generated at CREATE time instead
		if ((path == '__v')) continue; 
		
		var def =  Model.schema.paths[path].defaultValue;
		if (typeof def === "undefined") def = null;
		blankDocument[path] = def;
	}

	// blank url endpoint to return the blank object after evaluating any functions
	meanify.blank = function(req, res, next)
	{
		var data = {};
		for (var path in blankDocument)
		{
			if (typeof blankDocument[path] === "function") data[path] = blankDocument[path]();
			else data[path] = blankDocument[path];
		}
		res.json(data);
	}
}

module.exports = function (options) {

	options = options || {};

	var router = express.Router({
		caseSensitive: options.caseSensitive || true,
		strict: options.strict || true
	});

	// Incoming request bodies are JSON parsed.
	router.use(parser.json());

	function api() {
		return router;
	}

	if (options.path) {
		if (options.path.charAt(options.path.length - 1) !== '/') {
			options.path = options.path + '/';
		}
	} else {
		options.path = '/';
	}

	for (var model in mongoose.models) {

		var path = options.path;

		var route = model;
		if (options.lowercase !== false) {
			route = route.toLowerCase();
		}

		if (options.pluralize) {
			route = pluralize(route);
		}

		path = path + route;
		var Model = mongoose.model(model);
		var meanify = new Meanify(Model, options);

		// Save route for manual middleware use case.
		api[route] = meanify;

		// Skip middleware routes for excluded models.
		if (options.exclude && options.exclude.indexOf(model) !== -1) {
			continue;
		}
        console.log(path);
		// Generate middleware routes.
		router.get(path, meanify.search);
		debug('GET    ' + path);
		router.post(path, meanify.create);
		debug('POST   ' + path);
		if (options.puts) {
			router.put(path, meanify.create);
			debug('PUT    ' + path);
		}
		path += '/:id';
		router.get(path, meanify.read);
		debug('GET    ' + path);
		if (options.puts) {
			router.put(path, meanify.update);
			debug('PUT    ' + path);
		}
		router.post(path, meanify.update);
		debug('POST   ' + path);
		
		var methods = Model.schema.methods;
		for (var method in methods) {
			// prevent method execution if not web invokable
			if (!options.invokableMethodTest(methods[method]))
				continue;

			router.post(path + '/' + method, meanify.update[method]);
			debug('POST   ' + path + '/' + method);
		}
		router.delete(path, meanify.delete);
		debug('DELETE ' + path);

		// Sub-document route support.
		var root = path;
		var paths = Model.schema.paths;
		var subpath;
		for (var field in paths) {
			// TODO: Bad re-use of path.
			path = paths[field];
			if (path.schema) {
				subpath = root + '/' + field;
				router.get(subpath, meanify[field].search);
				debug('GET    ' + subpath);
				router.post(subpath, meanify[field].create);
				debug('POST   ' + subpath);
				if (options.puts) {
					router.put(subpath, meanify[field].create);
					debug('PUT    ' + subpath);
				}
				subpath += '/:' + field + 'Id';
				router.get(subpath, meanify[field].read);
				debug('GET    ' + subpath);
				router.post(subpath, meanify[field].update);
				debug('POST   ' + subpath);
				if (options.puts) {
					router.put(subpath, meanify[field].update);
					debug('PUT    ' + subpath);
				}
				router.delete(subpath, meanify[field].delete);
				debug('DELETE ' + subpath);
			}
		}
	}

	return api;
};

// takes the filter defined in the options and applies those values to the fields array to enforce a server-side filter
function applyFilter(req,fields,options,Model)
{
	var filter = options._filterFunc(req,Model);
		for (var f in filter)
			fields[f] = filter[f];
}