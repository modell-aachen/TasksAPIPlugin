;(function ($, _, document, window, undefined) {
  'use strict';

  var options = {};
  var tasks = {};

  $.fn.tasksGrid = function() {
    if ( typeof _ === typeof undefined ) {
      error( "Missing dependency underscore.js");
      return this;
    }

    return this.each(function () {
      var $this = $(this);

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      var opts = $.parseJSON( json );
      var decoded = decodeURIComponent( opts.template );

      opts.template = _.template( decoded );
      opts.canLoadMore = true;
      opts.page = 0;
      opts.cntHeight = $this.height();
      opts.container = $this.find('.tasks > div');

      options[id] = opts;
      loadTasks( id, true );

      var $tasks = $this.children('.tasks');
      var $editor = $this.children('.editor');
      var $filter = $this.children('.filter');
      var $save = $editor.find('.btn-save');
      var $cancel = $editor.find('.btn-cancel');
      var $create = $filter.find('.btn-create');

      var handleScroll = function( evt ) {
        var $this = $(this);
        var opts = options[id];
        var st = $this.scrollTop();
        var current = parseInt(st/opts.cntHeight);
        if ( opts.canLoadMore && current > opts.page ) {
          opts.page = current;
          $.blockUI();
          loadTasks( id ).done( function( results ) {
            opts.canLoadMore = results.length > 0;
          }).always( $.unblockUI );
        }
      };

      var handleCancel = function() {
        $tasks.removeClass('edit');
        $editor.removeClass('active');
        $tasks.find('.task').removeClass('faded selected');

        $editor.find('input,select,textarea').each( function() {
          var $input = $(this);
          $input.val('');
          $input.trigger('Clear');
        });

        return false;
      };

      var handleSave = function() {
        var task = readEditor( $editor );

        var beforeSave = $.Event( 'beforeSave' )
        $this.trigger( beforeSave, task ); 
        if( beforeSave.isDefaultPrevented() ) {
          return false;
        }

        // missing value for mandatory field
        if ( task === null ) {
          return false;
        }

        if ( $editor.data('new') === true ) {
          var now = moment();
          task.form = opts.form;

          $.blockUI();
          $.taskapi.create( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
            var $task = $(opts.template(task));
            $task.on('click', raiseClicked );
            $task.find('.btn-edit').on('click', options[id].onEditClicked);

            $task.data('id', response.id);
            opts.container.prepend( $task );
            $editor.data('new', '');

            $cancel.click();

            var afterSave = $.Event( 'afterSave' )
            $this.trigger( afterSave, response.id ); 
          });

          return false;
        }

        var $task = $tasks.find('.selected');
        var taskId = $task.data('id');
        task.id = taskId;
        var selected = _.findWhere( tasks[id], {id: taskId} );
        var fields = getFieldDefinitions( selected );

        $.blockUI();
        $.taskapi.update( task ).fail( error ).always( $.unblockUI ).done( function() {
          var $newTask = $(opts.template(task));
          $task.html( $newTask.html() );
          $task.find('.btn-edit').on('click', options[id].onEditClicked);

          updateStoredTask( selected, task, fields );
          $cancel.click();
        });

        return false;
      };

      var handleCreate = function() {
        var beforeCreate = $.Event( 'beforeCreate' )
        $this.trigger( beforeCreate ); 
        if( beforeCreate.isDefaultPrevented() ) {
          return false;
        }

        var id = $(this).closest('.tasktracker').attr('id');
        $editor.addClass('active');
        $tasks.addClass('edit');
        clearEditor( $editor );
        $editor.data('new', true);
        highlightTask( opts.container.children(), null );

        var afterCreate = $.Event( 'afterCreate' )
        $this.trigger( afterCreate );
        return false;
      };

      $tasks.on( 'scroll', handleScroll );
      $cancel.on( 'click', handleCancel );
      $save.on( 'click', handleSave );
      $create.on( 'click', handleCreate );

      return this;
    });
  };

  var loadTasks = function( id, initial ) {
    var deferred = $.Deferred();

    var opts = options[id];
    if ( !tasks[id] || typeof tasks[id].length !== 'number' ) {
      tasks[id] = [];
    }

    var $tasks = opts.container.parent();
    var $grid = $tasks.parent();
    var $editor = $grid.children('.editor');

    opts.onEditClicked = function( evt ) {
      var $tracker = $(this).closest('.tasktracker');
      var id = $tracker.attr('id');
      var $task = $(this).closest('.task');
      var selected = _.findWhere( tasks[id], {id: $task.data('id')} );

      var beforeEdit = $.Event( 'beforeEdit' )
      $tracker.trigger( beforeEdit, selected ); 
      if( beforeEdit.isDefaultPrevented() ) {
        return false;
      }

      var fields = getFieldDefinitions( selected );
      writeEditor( $editor, fields, selected );
      highlightTask( opts.container.children(), $task );

      $editor.addClass('active');
      $tasks.addClass('edit');

      var afterEdit = $.Event( 'afterEdit' )
      $tracker.trigger( afterEdit ); 
    };

    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    var query = [
      'field_Context_s:',
      opts.context,
      ' ',
      opts.query
    ].join('');
    $.taskapi.get(query, fetchSize, opts.page).done( function( solr ) {
      var docs = solr.response.docs;
      for( var i = 0; i < docs.length; ++i ) {
        var doc = docs[i];
        tasks[id].push( doc );

        var task = mapToTask( doc );
        var html = opts.template( task );
        var $html = $(html);
        $html.data('id', doc.id);
        opts.container.append( $html );

        $html.on('click', raiseClicked );
        $html.find('.btn-edit').on('click', opts.onEditClicked );
      }

      deferred.resolve( docs );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var raiseClicked = function( evt ) {
    if ( $(evt.target).hasClass('btn-edit') ) {
      return false;
    }

    var taskClick = $.Event( 'taskClick' )
    var $tracker = $(this).closest('.tasktracker');
    $tracker.trigger( taskClick, this ); 
  };

  var getFieldDefinitions = function( solrEntry ) {
    var props = Object.getOwnPropertyNames( solrEntry );
    var fieldNames = _.filter( props, function( item ) {
      return /^field_/.test( item );
    });

    var fields = [];
    _.each( fieldNames, function( name ) {
      var match = name.match( /^field_(.+)_(.+)/ );
      if ( match && match.length > 2 ) {
        var field = {
          name: match[1],
          type: match[2],
          raw: name
        };

        fields.push( field );
      }
    });

    return fields;
  };

  var writeEditor = function( editor, fields, data ) {
    var $editor = $(editor);
    _.each( fields, function( field ) {
      var sel = [
        'input#',
        field.name,
        ',',
        'input[name="',
        field.name,
        '"],textarea[name="',
        field.name,
        '"],select[name="',
        field.name,
        '"]'
      ].join('');

      var $input = $editor.find(sel);
      if ( $input.length > 0 ) {

        var val = data[field.raw];
        if ( field.type === 'lst' ) {
          if ( !/^https?:\/\//.test(val) ) {
            $input.trigger('AddValue', val );
          }
        } else if ( field.type === 'dt') {
          var due = moment( val );
          $input.val( due.format('DD MMM YYYY') );
        } else {
          $input.val( data[field.raw] );
        }
      }
    });
  };

  var clearEditor = function( editor ) {
    $('input,textarea').each( function() {
      var $this = $(this);
      $this.val('');
      $this.trigger('Clear');
    });
  };

  var readEditor = function( editor ) {
    var $editor = $(editor);
    var data = {};

    var hasError = false;
    $editor.find('input[name],select[name],textarea[name]').each(function() {
      var $input = $(this);
      var prop = $input.attr('name');
      var val = $input.val();

      if ( /^$/.test(val) ) {
        val = $input.attr('value');
        if ( /^$/.test(val) ) {
          val = $input[0].getAttribute('value');
        }
      }

      if ( $input.hasClass('foswikiMandatory') && (/^$/.test( val ) || val === null || val === undefined ) ) {
        alert('TBD. missing value for mandatory field');
        hasError = true;
        return false;
      }

      data[prop] = val;
    });

    if ( hasError ) {
      return null;
    }

    return data;
  };

  var highlightTask = function( container, task ) {
    if ( task === null ) {
      container.each( function() {
        $(this).addClass('faded');
      });

      return;
    }

    var $task = $(task);
    container.each( function(){
      var $child = $(this);
      if ( $child[0] === $task[0] ) {
        $child.addClass('selected');
      } else {
        $child.addClass('faded');
      }
    });
  };

  var mapToTask = function( solrEntry ) {
    var task = {id: solrEntry.id};
    var fields = getFieldDefinitions( solrEntry );
    _.each( fields, function( field ) {
      var val = solrEntry[field.raw];
      if ( field.type === 'dt' ) {
        var date = moment(val);
        val = date.format('DD MMM YYYY')
      }

      task[field.name] = val;
    });

    // ToDo. fix this. currently used as hotfix for ProjectsAppPlugin
    if ( typeof task.Description === typeof undefined ) {
      task.Description = 'n/a';
    }

    return task;
  };

  var updateStoredTask = function( solrEntry, data, fields  ) {
    var newFields = [];
    var props = Object.getOwnPropertyNames( data );
    _.each( props, function( prop ) {
      var field = _.findWhere( fields, {name: prop} );
      if ( typeof field === 'object' ) {
        field.value = data[prop];
        newFields.push( field );
      }
    });

    _.each( newFields, function( field ) {
      solrEntry[field.raw] = field.value;
    });
  };

  var error = function( msg ) {
    if ( !msg ) {
      return;
    }

    if ( window.console && console.error ) {
      console.error( msg );
    }
  };

  var log = function( msg ) {
    if ( !msg ) {
      return;
    }

    if ( window.console && console.log ) {
      console.log( msg );
    }
  };

  $(document).ready( function() {
    $('.tasktracker').tasksGrid();
  });
}(jQuery, window._, window.document, window));
