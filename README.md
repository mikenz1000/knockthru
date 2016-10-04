# knockthru

Allows you to databind the [Knockout](http://knockoutjs.com/) UI in the browser directly against the [Mongoose](https://www.npmjs.com/package/mongoose)
datamodel without having to write glue code.

The data is served up to SCRUD endpoints automatically created by the embedded meanify implementation.  The knockthru.js
file you include in the browser code looks for data-knockthru attributes on elements and creates/binds viewmodels using Knockout
accordingly.

# Complete Examples

This is the best way to see knockthru in action and to understand how it works.

After running ```npm update``` change to the example folder and run ```node server```

The port on which the example is being served will be written to the console, typically ```http://localhost:3000```

You'll need to have mongoose db running locally on port 27017

# Snippets

To list the Tasks in the server-side mongoose database that have done set to 0
```
	<div data-knockthru='kt.search("Task",{done:0})'>
		<p data-bind='foreach: items'>
		...
		</p>
	</div>
```

To provide a box for the user to define a new Task
```
    <tfoot data-knockthru='kt.create("Task")' data-bind='with: item'>
        <tr>
            <td><input type="text" data-bind='textInput: description, onEnterKey: (description ? $parent.submitCreate : null)' ></td>
            <td><button data-bind='enable: description, click:$parent.submitCreate'>Add</input></td>
        </tr>            
    </tfoot>  
```

To display a specific task identified by ?id=<some identifier> on the querystring and allow the user to edit it
```
	<div data-knockthru='kt.read("Task",kt.getUrlParameter("id"))'>
		<div data-bind='with: item' >
            ...    
                <input type="text" data-bind='textInput: description'>
            ...
                <input type='checkbox' data-bind='checked: done' id="doneInput">Done</input>
            ...
        </div>
        <button data-bind='enable: item.isDirty(), click:submitUpdate'>Save</button>
        <button data-bind='click: submitDelete'>Delete</button>
	</div>
```

To run knockthru with server-side filters/predicates that will allow you to ensure url re-writers can't access data they
shouldn't be able to, e.g. to ensure all data requests have a filter on a field called ```user``` that has a value
of ```req.user.id``` (if you are using passport, for example)
```
require('knockthru')(app,
{
    predicates: function(req, model) { return {user:req.user.id} }
});

```

# ViewModel Functions

These methods can be used in the data-knockthru attributes

## kt.search(modelname[, filters])

Generates a viewmodel the can display a readonly list of items

|element    | description                                                                            |
|-----------|----------------------------------------------------------------------------------------|
|items      | an observable array of the result of the search                                        |
|createItem | an observable 'blank' you can bind to for create functionality (see create)            |
|errors     | an observable list of strings detailing any errors / validation errors from the server |
|refresh    | event handler to re-run the query                                                      |


## kt.searchEdit(modelname[, filters])

Generates a viewmodel for an editable list of items 

|element    | description                                                                            |
|-----------|----------------------------------------------------------------------------------------|
|items      | an observable array of the result of the search                                        |
|createItem | an observable 'blank' you can bind to for create functionality (see create)            |
|errors     | an observable list of strings detailing any errors / validation errors from the server |
|isDirty    | observable boolean indicating whether changes have been made                           |
|delete     | event handler to delete an item                                                        |
|submit     | event handler to save all the changes made                                             |
|refresh    | event handler to re-run the query                                                      |

Note on delete: use within the context of one of the items array e.g. data-bind='click:$parent.delete' 
```
    <tbody data-knockthru='kt.searchEdit("Task")' data-bind='foreach: items'>
        <tr>
        ...
            <td><button class='form-control btn-xs'><span class='glyphicon glyphicon-remove' data-bind='click:$parent.delete'></button></td>
        </tr>
    </tbody>
```

## kt.create(modelname[, predicates])

Generates a viewmodel for creating a new item.  The default values of the fields are obtained from the server.

|element    | description                                                                            |
|-----------|----------------------------------------------------------------------------------------|
|blank      | an observable blank item with fields populated with default values from the server     |
|error      | an observable string detailing any errors / validation errors from the server          |
|submitCreate | event handler to write the new item to the server                                    |
|addToSearch  | event handler to add the item to a search/searchEdit viewmodel on the page           |

## kt.read(modelname, id)

Generates a viewmodel for binding to a specific item in the database, identified by the id

|element    | description                                                                            |
|-----------|----------------------------------------------------------------------------------------|
|item       | an observable item representing the object read from the server                        |
|error      | an observable string detailing any errors / validation errors from the server          |
|refresh    | event handler to re-run the query                                                      |
|submitUpdate | event handler to write the new item to the server                                    |
|submitDelete | event handler to write the new item to the server                                    |

