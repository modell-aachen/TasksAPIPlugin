;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.tasksGrid = function() {
    if ( typeof _ === typeof undefined ) {
      error( "Missing dependency underscore.js");
      return this;
    }

    if (!$('#task-editor').length) {
      $('body').append('<div id="task-editor"></div>');
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
      loadTasks( $this, opts.currentState, true );

      var $task_subbtn = $this.children('.task-subbtn-template').removeClass('task-subbtn-template').detach();
      opts.taskSubBtn = $task_subbtn;

      var $tasks = $this.children('.tasks');
      var $editor = $('#task-editor');
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');
      var $create = $filter.find('.tasks-btn-create');

      var handleCreate = function() {
        $editor.taskEditor({ form: opts.form }).done(function(type, data) {
          if (type === save) {
            opts.container.append(createTaskElement(data));
          }
        }).fail(error);
        return false;
      };

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        opts.currentState = $select.val();
        opts.container.empty();

        loadTasks( $this, opts.currentState, true );
      };

      $create.on( 'click', handleCreate );
      $status.on( 'change', handleStatusFilterChanged );

      $editor.on( 'afterSave', function( evt, task ) {
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
      var $task = evt.data;
      $('#task-editor').taskEditor({ id: $task.data('id') }).done(function(type, data) {
        if (type === 'save') {
          $task.replaceWith(createTaskElement(data));
        }
      }).fail(function(type, msg) {
        error(msg);
      });

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

    if (initial) {
      var results = [];
      $(container).children('.task').each(function(idx, e) {
        var data = $.parseJSON( $(e).children('.task-data').text().replace(/\n/g, '') );
        initTaskElement($(e), data, opts);
        results.push(data);
      });
      deferred.resolve({data: results});
      return deferred.promise();
    }

    $.blockUI();
    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    var query = {
      Context: opts.context,
    };

    $.extend(query, $.parseJSON(opts.query));

    if ( !/^(1|true)$/i.test( opts.stateless ) && status !== 'all' ) {
      query.Status = status;
    } else {
      query.Status = ['open', 'closed'];
    }
    if (parent) {
      query.Parent = parent;
    } else {
      query.Parent = '';
    }

    $.taskapi.get(query, fetchSize, opts.page).always(function() {
      $.unblockUI();
    }).done( function( response ) {
      _.each( response.data, function(entry) {
        container.append( createTaskElement(entry, opts) );
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

  var initTaskElement = function($task, task, opts) {
    $task.data('id', task.id);
    $task.data('task_data', task);
    $task.on('click', raiseClicked );
    $task.find('.btn-edit').on('click', $task, opts.onEditClicked);

    if ($task.is('.task-nesting')) {
      $task.find('.task-children-summary .add').append(opts.taskSubBtn.clone());
      $task.find('.task-child-add').click(opts.onAddChildClicked);
      $task.find('.nest').click(opts.onToggleChildrenClicked);
    }
  };

  var createTaskElement = function(task, opts) {
    var $task = $(task.html);
    initTaskElement($task, task, opts);
    return $task;
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
    var onTaskClick = function( evt, task ) {
      $(task).toggleClass('expanded');
    };

    $('.tasktracker').each( function() {
      var $tracker = $(this);
      $tracker.tasksGrid();

      if ( /^1$/.test( $tracker.attr('data-expand') ) ) {
        $tracker.on( 'taskClick', onTaskClick );
      }
    });
  });
}(jQuery, window._, window.document, window));
