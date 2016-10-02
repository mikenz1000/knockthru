# knockthru

Allows you to databind the Knockout UI in the client directly against the Mongoose datamodel without having to write glue code.

# Example

In your html header, include knockthru.js
```
<script src='/kt/knockthru.js'></script>
```

Then use the data-knockthru attribute to tell knockthru what viewmodel to generate and where to bind it to, e.g.
```
	<div data-knockthru='kt.search("Task")'>
		<p data-bind='foreach: items'>
		...
		</p>
	</div>
```
Available viewmodels are

##kt.search(modelname[, filters])

Generates a viewmodel with the following content

|element ||
|--------|---------------------------------------------------------------------------------------|
|items   | an observable array of the result of the search                                       |
|errors  | observable list of strings detailing any errors / validation errors from the server   |
|submit  | handler to save the changes                                                           |
|refresh | event handler to re-run the query                                                     |
|--------|---------------------------------------------------------------------------------------|

