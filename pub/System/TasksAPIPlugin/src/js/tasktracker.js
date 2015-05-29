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

      opts.cntHeight = $this.height();
      opts.container = $this.find('.tasks > div');

      opts.currentState = 'open';
      $this.data('tasktracker_options', opts);
      loadTasks( $this, opts.currentState, true );

      // ToDo: phase out
      var $task_subbtn = $this.children('.task-subbtn-template').removeClass('task-subbtn-template').detach();
      opts.taskSubBtn = $task_subbtn;

      var $tasks = $this.children('.tasks');
      var $editor = $('#task-editor');
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');
      var $create = $filter.find('.tasks-btn-create');

      var handleCreate = function() {
        var qopts = {};
        $.extend(qopts, opts);
        delete qopts.id;

        $editor.taskEditor(qopts).done(function(type, data) {
          if (type === 'save') {
            opts.container.append(createTaskElement(data));
          }
        }).fail(error);
        return false;
      };

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        opts.currentState = $select.val();
        opts.container.empty();
        loadTasks( $this, opts.currentState, false );
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

    if ( opts.query ) {
      var json = $.parseJSON( opts.query );
      if ( json.Status && opts.currentState ) {
        json.Status = opts.currentState;
        opts.query = JSON.stringify( json );
      }
    }

    var $tasks = container.parent();
    var $grid = $tasks.parent();

    if (initial) {
      var results = [];
      $(container).children('.task').each(function(idx, e) {
        var data = $.parseJSON( $(e).children('.task-data').text() );

        initTaskElement($(e), data, opts);
        results.push(data);
      });
      deferred.resolve({data: results});
      return deferred.promise();
    }

    $.blockUI();
    var query = {
      Context: opts.context,
    };

    $.extend(query, $.parseJSON(opts.query));
    if ( !/^(1|true)$/i.test( opts.stateless ) && status !== 'all' ) {
      query.Status = status;
    } else {
      if ( opts.currentState !== 'all' ) {
        query.Status = [opts.currentState];
      } else {
        query.Status = ['open', 'closed'];
      }
    }

    if (parent) {
      query.Parent = parent;
    }

    var qopts = {};
    $.extend(qopts, opts);
    qopts.query = query;

    $.taskapi.get(qopts).always(function() {
      $.unblockUI();
    }).done( function( response ) {
      _.each( response.data, function(entry) {
        var $task = createTaskElement(entry);
        var $desc = $task.find('.description');
        $desc.text(decodeURIComponent( unescape($desc.text()) ));
        container.append( $task );
      });

      deferred.resolve( response.data );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var toggleTaskExpanded = function(evt) {
    var $btn = $(this);

    var $task = $btn.closest('.task');
    var data = {
      isExpanded: $task.hasClass('expanded'),
      container: $task
    };

    var e = $.Event('toggleExpand');
    var $tracker = $task.closest('.tasktracker');
    $tracker.trigger( e, data );

    $task.toggleClass('expanded');
/*
    var txt = decodeURIComponent(unescape($task.find('.full-description').text()));

    var $full = $task.find('.task-full-wrapper');
    var $desc = $task.find('.task-wrapper .description');
    if ( !$full.html() ) {
      $full.html( '<div>' + txt + '</div>' );
      $desc.css('opacity', 0);
    } else {
      $full.empty();
      $desc.css('opacity', 1);
    }
*/
  };

  var initTaskElement = function($task, task) {
    $task.data('id', task.id);
    $task.data('task_data', task);
  };

  var createTaskElement = function(task) {
    var $task = $(task.html);
    initTaskElement($task, task);
    return $task;
  };

  var editClicked = function( evt ) {
    var $btn = $(this);
    var edopts = {};
    var $tracker = $btn.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    for(var p in opts ) {
      if ( /string|number|boolean/.test( typeof opts[p] ) ) {
        edopts[p] = opts[p];
      }
    }

    var $task = $btn.closest('.task');
    edopts.id = $task.data('id');
    edopts.trackerId = $tracker.attr('id');

    var task = $.parseJSON( $task.find('.task-data').text() );
    edopts.data = task;

    var expanded = $task.is('.expanded');
    $('#task-editor').taskEditor(edopts).done(function(type, data) {
      if (type === 'save') {

        var $newTask = $(createTaskElement(data));
        if (expanded) {
          $newTask.addClass('expanded');
        }
        $task.replaceWith( $newTask );
      }
    }).fail(function(type, msg) {
      error(msg);
    });
  };

  var sortTasks = function() {
    var $filter = $(this);
    var $tracker = $filter.closest('.tasktracker');
    var sortBy = $filter.data('tasksort');

    $('[data-tasksort]').each( function() {
      if ( $(this).data('tasksort') !== sortBy ) {
        $(this).removeClass('tasksort-asc tasksort-desc');
      }
    });

    var $tasks = $tracker.find('.tasks > div');
    var tasks = $tasks.find('.task');

    var sortedTasks = _.sortBy( tasks, function(task) {
      var d  =$.parseJSON($(task).find('.task-data').text());
      var val = d.fields[sortBy].value;
      return val;
    });

    if ( $filter.hasClass('tasksort-asc') ) {
      sortedTasks = sortedTasks.reverse();
      $filter.removeClass('tasksort-asc');
      $filter.addClass('tasksort-desc');
    } else if ( $filter.hasClass('tasksort-desc') || (!$filter.hasClass('tasksort-asc') && !$filter.hasClass('tasksort-desc')) ) {
      $filter.removeClass('tasksort-desc');
      $filter.addClass('tasksort-asc');
    }

    $tasks.empty();
    _.each(sortedTasks, function(task) {
      $(task).appendTo($tasks);
    });

  };

  var error = function() {
    if ( window.console && console.error ) {
      _.each( [].splice.call(arguments, 0), function( msg ) {
        console.error( msg );
      });
    }
  };

  var log = function( msg ) {
    if ( window.console && console.log ) {
      _.each( [].splice.call(arguments, 0), function( msg ) {
        console.log( msg );
      });
    }
  };

  $(document).ready( function() {
    $('.tasktracker')
      .tasksGrid()
      .on('click', '[data-tasksort]', sortTasks)
      .on('click', '.btn-expander', toggleTaskExpanded)
      .on('click', '.btn-edit', editClicked);
  });
}(jQuery, window._, window.document, window));
