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

      opts.currentState = 'open';
      options[id] = opts;
      $.blockUI();
      loadTasks( id, opts.currentState, true ).always( $.unblockUI );

      var $tasks = $this.children('.tasks');
      var $editor = $('#task-editor-' + id);
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');
      var $save = $editor.find('.tasks-btn-save');
      var $cancel = $editor.find('.tasks-btn-cancel');
      var $create = $filter.find('.tasks-btn-create');

      $editor.dialog({
        autoOpen: false,
        closeOnEscape: true,
        modal: true,
        resizable: false
      });

      // todo. fixme
      // var handleScroll = function( evt ) {
      //   var $this = $(this);
      //   var opts = options[id];
      //   var st = $this.scrollTop();
      //   var current = parseInt(st/opts.cntHeight);
      //   if ( opts.canLoadMore && current > opts.page ) {
      //     opts.page = current;
      //     $.blockUI();
      //     loadTasks( id, opts.currentState ).done( function( results ) {
      //       opts.canLoadMore = results.length > 0;
      //     }).always( $.unblockUI );
      //   }
      // };

      var handleCancel = function() {
        $tasks.removeClass('edit');
        $editor.dialog('close');
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

        var beforeSave = $.Event( 'beforeSave' );
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
          task.Context = opts.context;

          $.blockUI();
          $.taskapi.create( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
            var $task = $(opts.template(task));
            $task.on('click', raiseClicked );
            $task.find('.btn-edit').on('click', options[id].onEditClicked);

            task.id = response.id;
            $task.data('id', response.id);
            opts.container.append( $task );
            $editor.data('new', '');

            if ( typeof tasks[id] === typeof undefined ) {
              tasks[id].push( task );
            }

            var afterSave = $.Event( 'afterSave' );
            $this.trigger( afterSave, task );

            $cancel.click();
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

          var afterSave = $.Event( 'afterSave' );
          $this.trigger( afterSave, task );

          $cancel.click();
        });

        return false;
      };

      var handleCreate = function() {
        var beforeCreate = $.Event( 'beforeCreate' );
        $this.trigger( beforeCreate ); 
        if( beforeCreate.isDefaultPrevented() ) {
          return false;
        }

        var id = $(this).closest('.tasktracker').attr('id');
        $editor.dialog('open');

        // $editor.addClass('active');
        $tasks.addClass('edit');

        clearEditor( $editor );
        $editor.data('new', true);
        highlightTask( opts.container.children(), null );

        var afterCreate = $.Event( 'afterCreate' );
        $this.trigger( afterCreate );
        return false;
      };

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        opts.currentState = $select.val();
        opts.container.empty();

        $.blockUI();
        loadTasks( id, opts.currentState, true ).always( $.unblockUI );
      };

      // $tasks.on( 'scroll', handleScroll );
      $cancel.on( 'click', handleCancel );
      $save.on( 'click', handleSave );
      $create.on( 'click', handleCreate );
      $status.on( 'change', handleStatusFilterChanged );

      $this.on( 'afterSave', function( evt, task ) {
        if ( task.Status !== $status.val() ) {
          $tasks.find('.task').each( function() {
            var $t = $(this);
            if ( $t.data('id') === task.id ) {
              $t.remove();
              return false;
            }
          });
        }
      });

      return this;
    });
  };

  var loadTasks = function( id, status, initial ) {
    var deferred = $.Deferred();

    var opts = options[id];
    if ( !tasks[id] || typeof tasks[id].length !== 'number' ) {
      tasks[id] = [];
    }

    var $tasks = opts.container.parent();
    var $grid = $tasks.parent();

    opts.onEditClicked = function( evt ) {
      var $tracker = $(this).closest('.tasktracker');
      var id = $tracker.attr('id');
      var $editor = $('#task-editor-' + id);
      var $task = $(this).closest('.task');
      var selected = _.findWhere( tasks[id], {id: $task.data('id')} );

      var beforeEdit = $.Event( 'beforeEdit' );
      $tracker.trigger( beforeEdit, selected ); 
      if( beforeEdit.isDefaultPrevented() ) {
        return false;
      }

      var fields = getFieldDefinitions( selected );
      writeEditor( $editor, fields, selected );
      highlightTask( opts.container.children(), $task );

      $tasks.addClass('edit');
      $editor.dialog('open');

      var afterEdit = $.Event( 'afterEdit' );
      $tracker.trigger( afterEdit ); 
    };

    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    var query = {
      Context: opts.context,
    };

    $.extend(query, $.parseJSON(opts.query));

    if ( !/^(1|true)$/i.test( opts.stateless ) ) {
      query.Status = status;
    }

    $.taskapi.get(query, fetchSize, opts.page).done( function( response ) {
      console.log(response);
      _.each( response.data, function(entry) {
        tasks[id].push( entry );

        var task = mapToTask( entry );
        var html = opts.template( task );
        var $html = $(html);
        $html.data('id', entry.id);
        opts.container.append( $html );

        $html.on('click', raiseClicked );
        $html.find('.btn-edit').on('click', opts.onEditClicked );
      });

      deferred.resolve( response.data );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var timeout = null;
  var raiseClicked = function( evt ) {
    if ( $(evt.target).hasClass('btn-edit') ) {
      return false;
    }

    var self = this;
    if ( timeout === null ) {
      timeout = setTimeout( function() {
        timeout = null;
        var taskClick = $.Event( 'taskClick' );
        var $tracker = $(self).closest('.tasktracker');
        $tracker.trigger( taskClick, self ); 
      }, 250);
    } else {
      clearTimeout( timeout );
      timeout = null;
      raiseDoubleClicked( self );
    }
  };

  var raiseDoubleClicked = function( task ) {
    var taskDblClick = $.Event( 'taskDoubleClick' );
    var $tracker = $(task).closest('.tasktracker');
    $tracker.trigger( taskDblClick, task ); 
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

  var mapToTask = function( entry ) {
    var task = {id: entry.id};
    _.each( entry.fields, function( field ) {
      var val = field.value;
      if ( field.type === 'date' ) {
        var date = moment(val);
        val = date.format('DD MMM YYYY');
      }

      task[field.name] = val;
    });

    return task;
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
