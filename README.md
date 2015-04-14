# jQuery API
## create
**$.taskapi.create( data )**

Creates a new task.

```javascript
var task = {
  form: 'Web.FooForm',
  Field1: 'value',
  Field2: 'value'
};

$.taskapi.create(task).done( function( response ) {
  console.log( response.id ); // prints the id of the newly created task.
}).fail( function( err ) {
  console.log( err );
});
```


## get
**$.taskapi.get( query, limit [optional, defaults to 9999], offset [optional, defaults to 0], sort [optional] )**

Retreives tasks by a given query.

```javascript
$.taskapi.get('field_Responsible_s:AdminUser').done( function( solr ) {
  _.each( solr.response.docs, function( result ) {
    console.log( result );
  });
});
```


## getAll
**$.taskapi.getAll( limit [optional, defaults to 9999], offset [optional, defaults to 0], sort [optional] )**

Retreives all tasks.

```javascript
$.taskapi.getAll().done( function( solr ) {
  _.each( solr.response.docs, function( result ) {
    console.log( result );
  });
});
```


## getBy
**$.taskapi.getBy( filter, limit [optional, defaults to 9999], offset [optional, defaults to 0], sort [optional] )**

Same as *get* but also takes an object as argument.

```javascript
$.taskapi.getBy('field_Responsible_s:AdminUser').done( function( solr ) {
  _.each( solr.response.docs, function( result ) {
    console.log( result );
  });
});

var filter = {'field_Responsible_s': 'AdminUser'};
$.taskapi.getBy(filter).done( function( solr ) {
  _.each( solr.response.docs, function( result ) {
    console.log( result );
  });
});
```


## update
**$.taskapi.update( task )**

Updates an existing task identified by its id.

```javascript
var taskToUpdate = {
  id: 'Tasks.Task-134n213kj4hjk',
  UpdatedField: 'updatedValue'
};

$.taskapi.update( taskToUpdate ).done( function( response ) {
  console.log( response );
});
```


## multiupdate
**$.taskapi.multiupdate( tasks )**

Same as *update* but takes multiple tasks identified by their id.

```javascript
var tasksToUpdate = {
  'Tasks.Task-1': {
    UpdatedField: 'updatedValue'
  },
  'Tasks.Task-2': {
    UpdatedField: 'updatedValue'
  }
};

$.taskapi.multiupdate( tasksToUpdate ).done( function( response ) {
  for( var id in response ) {
    console.log( 'Updated task ' + id + ' with result' );
    console.log( response[id] );
  }
});
```



# Events
## beforeCreate
**cancelable.** Fired after the user clicked the 'create new task' button.
The task editor is not yet visible to the user and might still hold data from the previous edit/create action.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'beforeCreate', function( evt ) {
  if ( someState === state.invalid ) {
    return false; // cancel creation of a new task...
  }
});
```


## afterCreate
Fired after the editor has been cleaned and is shown to the user.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'afterCreate', function( evt ) {
  // whatever
});
```


## beforeEdit
**cancelable.** Fired after the user clicked the 'edit task' button. The selected task is passed into the event handler.
The editor is not yet visible to the user.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'beforeEdit', function( evt, task ) {
  if ( someState === state.invalid ) {
    return false; // cancel edit request...
  }

  // manipulate task
});
```


## afterEdit
Fired after *beforeEdit*. The editor is prepared and shown to the user.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'afterEdit', function( evt ) {
  console.log( 'task edited...' );
});
```


##beforeSave
**cancelable.** Fired after the user clicked the 'save task' button. The selected task is passed into the event handler.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'beforeSave', function( evt, task ) {
  if ( task === null ) {
    // error or missing mandatory field
    return false; // stop propagation
  }
```


##afterSave
Fired after a task has been saved. The according task is passed into the event handler.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'afterSave', function( evt, task ) {
  console.log( task );
});
```


## taskClick
Fired after a task has been clicked by the user. The task's DOM node is passed into the event handler.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'taskClick', function( evt, cnt ) {
  var $cnt = $(cnt);
  var taskId = $cnt.data('id');
  // ...
});
```


## taskDoubleClick
Fired after a task has been double clicked by the user. The task's DOM node is passed into the event handler.

```javascript
var $tracker = $('.tasktracker');
$tracker.on( 'taskDoubleClick', function( evt, cnt ) {
  var $cnt = $(cnt);
  var taskId = $cnt.data('id');
  // ...
});
```
