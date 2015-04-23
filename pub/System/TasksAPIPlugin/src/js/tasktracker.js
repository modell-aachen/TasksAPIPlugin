;(function ($, _, document, window, undefined) {
  'use strict';

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
      var decodedNesting = decodeURIComponent( opts.nestingTemplate );

      opts.template = _.template( decoded );
      opts.nestingTemplate = _.template( decodedNesting );
      opts.canLoadMore = true;
      opts.page = 0;
      opts.cntHeight = $this.height();
      opts.container = $this.find('.tasks > div');

      opts.currentState = 'open';
      $this.data('tasktracker_options', opts);
      $.blockUI();
      loadTasks( $this, opts.currentState, true ).always( $.unblockUI );

      var $task_subbtn = $this.children('.task-subbtn-template').removeClass('task-subbtn-template').detach();
      opts.taskSubBtn = $task_subbtn;

      var $tasks = $this.children('.tasks');
      var $editor = $('#task-editor-' + id);
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');
      var $save = $editor.find('.tasks-btn-save');
      var $cancel = $editor.find('.tasks-btn-cancel');
      var $create = $filter.find('.tasks-btn-create');

      $this.data('tasktracker_editor', $editor);

      $editor.dialog({
        autoOpen: false,
        closeOnEscape: true,
        modal: true,
        resizable: false
      });

      // todo. fixme
      // var handleScroll = function( evt ) {
      //   var $this = $(this);
      //   var st = $this.scrollTop();
      //   var current = parseInt(st/opts.cntHeight);
      //   if ( opts.canLoadMore && current > opts.page ) {
      //     opts.page = current;
      //     $.blockUI();
      //     loadTasks( $this, opts.currentState ).done( function( results ) {
      //       opts.canLoadMore = results.length > 0;
      //     }).always( $.unblockUI );
      //   }
      // };

      var handleCancel = function() {
        $tasks.removeClass('edit');
        $editor.dialog('close');
        $editor.removeData('subcontainer');
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
            task.id = response.id;

            var $task = createTaskElement(response.data, opts);

            $editor.data('subcontainer').append( $task );
            $editor.data('new', '');

            var afterSave = $.Event( 'afterSave' );
            $this.trigger( afterSave, task );

            $cancel.click();
          });

          return false;
        }

        var $task = $tasks.find('.selected');
        var taskId = $task.data('id');
        task.id = taskId;

        $.blockUI();
        $.taskapi.update( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
          var $newTask = createTaskElement(response.data, opts);
          $task.replaceWith($newTask);

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
        if (!$editor.data('subcontainer')) {
          $editor.data('subcontainer', opts.container);
        }

        $editor.dialog('open');

        // $editor.addClass('active');
        $tasks.addClass('edit');

        clearEditor( $editor );

        if ($editor.data('parent')) {
          $editor.find('input[name="Parent"]').val($editor.data('parent'));
          $editor.removeData('parent');
        }

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
        loadTasks( $this, opts.currentState, true ).always( $.unblockUI );
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

  var loadTasks = function( $tracker, status, initial, parent, container ) {
    var deferred = $.Deferred();

    var opts = $tracker.data('tasktracker_options');
    if (!container) {
      container = opts.container;
    }

    var $tasks = container.parent();
    var $grid = $tasks.parent();

    opts.onEditClicked = function( evt ) {
      var id = $tracker.attr('id');
      var $editor = $('#task-editor-' + id);
      var $task = $(this).closest('.task');
      var selected = $task.data('task_data');

      var beforeEdit = $.Event( 'beforeEdit' );
      $tracker.trigger( beforeEdit, selected );
      if( beforeEdit.isDefaultPrevented() ) {
        return false;
      }

      writeEditor( $editor, selected, $task );
      highlightTask( container.children(), $task );

      $tasks.addClass('edit');
      $editor.dialog('open');

      var afterEdit = $.Event( 'afterEdit' );
      $tracker.trigger( afterEdit );
    };

    opts.onAddChildClicked = function( evt ) {
      var $editor = $tracker.data('tasktracker_editor');
      $editor.data('subcontainer', $(this).closest('.task-children').children('.task-children-list'));
      $editor.data('parent', $(this).closest('.task').data('id'));
      $tracker.find('.tasks-btn-create').first().click();
    };

    opts.onToggleChildrenClicked = function( evt ) {
      var $task = $(this).closest('.task');
      var $ccontainer = $task.find('.task-children-list');
      var $btn = $task.find('.nest').first().children();
      if ($task.is('.children-expanded')) {
        $ccontainer.empty();
        $task.removeClass('children-expanded');
        $btn.removeClass('contract');
        return;
      }
      $task.addClass('children-expanded');
      $btn.addClass('contract');
      $.blockUI();
      loadTasks($tracker, status, initial, $task.data('id'), $ccontainer).done(function() {
      }).fail(function() {
        $btn.removeClass('contract');
        $task.removeClass('children-expanded');
        error.apply(this, arguments);
      }).always(function() {
        $.unblockUI();
      });
    };

    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    var query = {
      Context: opts.context,
    };

    $.extend(query, $.parseJSON(opts.query));

    if ( !/^(1|true)$/i.test( opts.stateless ) ) {
      query.Status = status;
    }
    if (parent) {
      query.Parent = parent;
    } else {
      query.Parent = '';
    }

    $.taskapi.get(query, fetchSize, opts.page).done( function( response ) {
      _.each( response.data, function(entry) {

        var task = mapToTask( entry );
        container.append( createTaskElement(task, opts) );
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

  var createTaskElement = function(task, opts) {
    var $task;
    if (typeof task.fields.HasChildren !== 'undefined' && task.fields.HasChildren.value === 'Yes') {
      $task =  opts.nestingTemplate(extractValues(task));
    } else {
      $task = opts.template(extractValues(task));
    }
    $task = $($task);
    $task.data('id', task.id);
    $task.data('task_data', task);
    $task.on('click', raiseClicked );
    $task.find('.btn-edit').on('click', opts.onEditClicked);

    if ($task.is('.task-nesting')) {
      $task.find('.task-children-summary .add').append(opts.taskSubBtn);
      $task.find('.task-child-add').click(opts.onAddChildClicked);
      $task.find('.nest').click(opts.onToggleChildrenClicked);
    }
    return $task;
  };

  var writeEditor = function( editor, task, $task ) {
    var $editor = $(editor);
    _.each( task.fields, function( field ) {
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

        var val = field.value;
        if ( field.type === 'textboxlist' ) {
          $input.trigger('AddValue', val );
        } else if ( field.type === 'date') {
          var due = moment( val );
          $input.val( due.format('DD MMM YYYY') );
        } else {
          $input.val( val );
        }
      }
    });
  };

  var clearEditor = function( editor ) {
    editor.find('input,textarea').each( function() {
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
    _.each( entry.fields, function( field ) {
      if ( field.type === 'date' ) {
        var date = moment(field.value);
        field.value = date.format('DD MMM YYYY');
      }
    });

    if (typeof entry.attachments !== 'undefined')
    {
      entry.fields.AttachCount = {
        name: 'AttachCount',
        value: entry.attachments.length,
        type: 'text'
      };
    }

    return entry;
  };

  var extractValues = function( entry ) {
    var task = {};
    _.each( entry.fields, function( field ) {
      task[field.name] = field.value;
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
