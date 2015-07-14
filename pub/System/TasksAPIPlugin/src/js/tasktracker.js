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
      opts.container = $this.children('.tasks-table').children('.tasks');

      opts.currentState = 'open';
      $this.data('tasktracker_options', opts);
      loadTasks( $this, opts.currentState, true );

      var $tasks = opts.container;
      var $editor = $('#task-editor');
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');

      var handleCreate = function() {
        var qopts = {};
        $.extend(qopts, opts);
        qopts.trackerId = opts.id;
        qopts._depth = parseInt(opts.depth);

        delete qopts.id;
        delete qopts.depth;

        var $self = $(this);
        var parent;
        if ( $self.hasClass('task-new') ) {
          var $parent = $self.closest('.task-children-container').prev();
          parent = $parent.data('id');
          if ( parent ) {
            qopts.parent = parent;

            var pdata = $parent.data('task_data');
            qopts._depth = parseInt(pdata.depth) - 1;
          }
        }

        var beforeCreate = $.Event( 'beforeCreate' );
        $this.trigger( beforeCreate, qopts );
        if( beforeCreate.isDefaultPrevented() ) {
          return false;
        }

        var evtResult = beforeCreate.result;
        if ( _.isObject( evtResult ) ) {
          delete evtResult.id;
          delete evtResult.trackerId;
          $.extend(qopts, evtResult);
        }

        $editor.taskEditor(qopts).done(function(type, data) {
          if (type === 'save') {
            var pid = data.fields.Parent.value;
            if (!parent) {
              opts.container.append(createTaskElement(data));
            } else {
              $(createTaskElement(data)).insertBefore($self);
            }

            applyLevels();
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

      $filter.find('.tasks-btn-create').on('click', handleCreate);
      $this.on('click', '.task-new', handleCreate);

      $status.on( 'change', handleStatusFilterChanged );
      $editor.on( 'afterSave', function( evt, task ) {
        if ( $status.length > 0 && task.Status !== $status.val() ) {
          $tasks.find('.task').each( function() {
            var $t = $(this);
            if ( $t.data('id') === task.id ) {
              $t.remove();
              return false;
            }
          });
        }

        if ( opts.sortable ) {
          try {
            sortTable.call($this.children('.tasks-table'), true);
          } catch(e) {
            error(e);
          }
        }
      });

      if ( opts.sortable ) {
        try {
          sortTable.call($this.children('.tasks-table'));
        } catch(e) {
          error(e);
        }
      }

      return this;
    });
  };

  var sortTable = function(forceSort) {
    var $tbl = $(this);
    if ( !forceSort && $tbl.find('> tbody .task').length === 0 ) {
      return;
    }

    var opts = $tbl.data('sortopts');
    if ( typeof opts === 'object' ) {
      var $col = $tbl.find('> thead .headerSortUp, > thead .headerSortDown').first();

      $tbl.trigger('update');
      if ( $col.length > 0 ) {
        var dir = $col.hasClass('headerSortUp') ? 1 : 0;
        var index = $col[0].column;

        // tablesorter's update event is processed by a timeout of 1.
        // use something higher than 1 here...
        setTimeout(function() {
          $tbl.trigger('sorton', [[[index, dir]]]);
        }, 10);
      }

      return;
    }

    opts = $tbl.metadata() || {};
    $tbl.data('sortopts', opts);
    $tbl.tablesorter(opts);
  };

  var unescapeHTML = function(obj) {
    if ( !obj.fields ) {
      return obj;
    }

    for(var prop in obj.fields) {
      obj.fields[prop].value = obj.fields[prop].value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
    }

    return obj;
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

    if (initial) {
      var results = [];
      $(container).children('.task').each(function(idx, e) {
        var $task = $(e);
        var data = unescapeHTML( $.parseJSON($task.children('.task-data-container').children('.task-data').text()) );

        initTaskElement($task, data);
        results.push(data);

        $task.find('.task-children .tasks').each(function() {
          $(this).children('.task').each(function() {
            var $task = $(this);
            var data = unescapeHTML( $.parseJSON($task.children('.task-data-container').children('.task-data').text()) );
            initTaskElement($task, data);
          });
        });
      });
      deferred.resolve({data: results});
      return deferred.promise();
    }

    $.blockUI();
    var query = {
      Context: opts.context
    };

    if ( opts.parent !== 'any' ) {
      query.Parent = parent || '';
    }

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

    var qopts = {};
    $.extend(qopts, opts);
    qopts.query = query;
    qopts._depth = opts.depth;

    $.taskapi.get(qopts).always(function() {
      $.unblockUI();
    }).done( function( response ) {
      _.each( response.data, function(entry) {
        var $task = createTaskElement(entry);
        container.append( $task );
      });

      deferred.resolve( response.data );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var getTaskSibling = function(direction) {
    var sel, func;
    if ( /^(left|up|prev)$/i.test(direction) ) {
      sel = '.task:last-child';
      func = 'prev';
    } else {
      sel = '.task:first-child';
      func = 'next';
    }

    var $task = $(this);
    var $sibling = $task[func].call(this);
    if ( !$sibling.hasClass('task') ) {
      $sibling = $task.parent().children(sel);
    }

    return $sibling;
  };

  var hoveredTask;
  var toggleTaskDetails = function(evt) {
    if (!hoveredTask) {
      return false;
    }

    var $task = hoveredTask;
    var data = {
      isDetailsView: $task.hasClass('highlight'),
      container: $task
    };

    var e = $.Event('toggleDetails');
    var $tracker = $task.closest('.tasktracker');
    $tracker.trigger( e, data );

    var showFunc = function() {
      var self = this;
      $task.children('.task-fullview-container').children('.task-fullview').detach().appendTo(this);
      $task.addClass('highlight');
      this.find('.btn-next').on('click', function() {
        var $newTask = getTaskSibling.call($task, 'next');
        $tracker.panel.replace.call(self, $newTask);
        return false;
      });

      this.find('.btn-prev').on('click', function() {
        var $newTask = getTaskSibling.call($task, 'prev');
        $tracker.panel.replace.call(self, $newTask);
        return false;
      });

      this.find('.btn-edit-viewer').on('click', function(evt) {
        $('#task-panel').children('.close').click();
        hoveredTask = $task;
        editClicked();
        return false;
      });
    };

    var hideFunc = function() {
      this.find('.btn-edit-viewer').off('click');
      this.find('.btn-next').off('click');
      this.find('.btn-prev').off('click');
      this.find('.task-fullview').detach().appendTo($task.children('.task-fullview-container'));
      $task.removeClass('highlight');
    };

    $tracker.panel = $tracker.taskPanel({
      show: showFunc,
      hide: hideFunc,
      replace: function( newTask ) {
        var self = this;
        hideFunc.call(self);
        $task = hoveredTask = $(newTask);
        showFunc.call(self);
      }
    });
    $tracker.panel.show();
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

  var editClicked = function() {
    if (!hoveredTask) {
      return false;
    }

    var $task = hoveredTask;
    var edopts = {};

    var $tracker = $task.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    for(var p in opts ) {
      if ( /string|number|boolean/.test( typeof opts[p] ) ) {
        edopts[p] = opts[p];
      }
    }

    var task = unescapeHTML( $.parseJSON($task.children('.task-data-container').text()) );
    edopts.autoassign = opts.autoassign;
    edopts.data = task;
    edopts.id = task.id;
    edopts.lang = opts.lang;
    edopts._depth = task.depth;
    edopts.trackerId = $tracker.attr('id');

    var expanded = $task.is('.expanded');
    $task.addClass('highlight');
    $('#task-editor').taskEditor(edopts).done(function(type, data) {
      $task.removeClass('highlight');
      if (type === 'save') {
        if (data.fields.Status.value === 'deleted') {
          $task.remove();
        } else {
          var $newTask = $(createTaskElement(data));
          $task.replaceWith( $newTask );

          if (expanded) {
            $newTask.next().remove();
            var $expander = $newTask.children('.expander');
            toggleTaskExpand.call($expander);
          }
        }

        applyLevels();
      }
    }).fail(function(type, msg) {
      error(msg);
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

  var taskMouseEnter = function(evt) {
    var $task = $(this);
    if (hoveredTask) {
      $('body > .controls').detach().appendTo($(hoveredTask).children('.task-controls'));
    }

    hoveredTask = $task;
    var $ctrl = $task.children('.task-controls').children('div')
      .detach()
      .appendTo('body');

    var offset = $task.offset();
    var left = offset.left + $task.outerWidth() - Math.min($ctrl.outerWidth(), 80);
    var top = offset.top;

    $ctrl
      .css('position','absolute')
      .css('left', left).css('top', top);
  };

  var taskMouseLeave = function(evt) {
    var $node = $(evt.toElement || evt.relatedTarget);
    var isCtrl = $node.hasClass('controls') ||
                  $node.parent().hasClass('controls') ||
                  $node.parent().parent().hasClass('controls');
    if ( isCtrl ) {
      return;
    }

    var $cnt = $(hoveredTask).children('.task-controls');
    $('body').children('.controls').detach().appendTo($cnt);
    hoveredTask = undefined;
  };

  var resetControls = function() {
    var $ctrl = $(this).parent();
    $ctrl.detach().appendTo($(hoveredTask).children('.task-controls'));
    hoveredTask = undefined;
  };

  var toggleTaskExpand = function(evt) {
    var $col = $(this);
    var $row = $col.parent();
    $row.toggleClass('expanded');

    // update tablesorter to respect child rows
    var $tbl = $col.closest('.tasks-table:not(.children)');
    $tbl.trigger('update');

    var isExpanded = $row.hasClass('expanded');
    if ( isExpanded ) {
      var span = $row.children('td').length;
      var $children = $row.children('.task-children').children('table.children').detach();
      var $new = $('<tr class="task-children-container"><td class="dashed-line" colspan="' + span + '"></td></tr>');
      $new.children('td').append($children);
      $new.insertAfter($row);
    } else {
      var $next = $row.next();
      var $table = $next.children('td').children('table.children').detach();
      $table.appendTo($row.children('.task-children'));
      $next.remove();
    }

    applyLevels();
  };

  var closeTask = function(evt) {
    hoveredTask.addClass('highlight');

    var $task = hoveredTask;
    var $next = $task.next();

    var $tracker = hoveredTask.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');

    if ( confirm(decodeURIComponent(opts.lang.closeTask)) ) {
      var data = hoveredTask.data('task_data');
      var payload = {
        id: data.id,
        Status: 'closed'
      };

      $.blockUI();
      $.taskapi.update(payload).fail(error).done(function(response) {
        $task.remove();
        if ( $next.hasClass('task-children-container') ) {
          $next.remove();
        }
      }).always($.unblockUI);

      return false;
    }

    $task.removeClass('highlight');
    return false;
  };

  var applyLevels = function() {
    $('.task:visible, .task-new:visible').each(function(i,e) {
      var lvl = 0;
      var $task = $(e);
      var $t = $(this);
      while ($t.parent().closest('.tasks-table').length) {
        $t = $t.parent().closest('.tasks-table');
        lvl++;
      }

      $task.attr('class', function(j,cls) {
        return cls.replace(/(^|\s)alternate/g, '') + (lvl%2===0 ? ' alternate' : '');
      });
    });
  };

  var dclickTimer;
  var onDoubleClick = function(evt) {
    if ( $(evt.target).closest('.expander').length !== 0 ) {
      return false;
    }

    var $task = $(this);
    $task.addClass('noselect');
    if ( dclickTimer ) {
      hoveredTask = $task;
      toggleTaskDetails();
    }

    dclickTimer = setTimeout(function() {
      dclickTimer = undefined;
      $task.removeClass('noselect');
    }, 300);
  };

  var attachEventHandler = function() {
    $('.tasks .task')
      .on('mouseenter', taskMouseEnter)
      .on('mouseleave', taskMouseLeave)
      .on('click', '.expander', toggleTaskExpand)
      .on('click', onDoubleClick);

    $('.controls .btn-close').on('click', closeTask);
    $('.controls .btn-details').on('click', toggleTaskDetails);
    $('.controls .btn-edit').on('click', editClicked);
    $('.controls .task-btn').on('click', resetControls);
  };

  var detachEventHandler = function() {
    $('.tasks .task')
      .off('mouseenter', taskMouseEnter)
      .off('mouseleave', taskMouseLeave)
      .off('click', '.expander', toggleTaskExpand)
      .off('click', onDoubleClick);

    $('.controls .btn-close').off('click', closeTask);
    $('.controls .btn-details').off('click', toggleTaskDetails);
    $('.controls .btn-edit').off('click', editClicked);
    $('.controls .task-btn').off('click', resetControls);
  };

  $(document).ready( function() {
    $('.tasktracker')
      .tasksGrid()
      .observe('added', 'tr.task', function(record) {
        detachEventHandler();
        attachEventHandler();
      })
      .observe('removed', 'tr.task', function(record) {
        detachEventHandler();
        attachEventHandler();
      });

    attachEventHandler();
    applyLevels();
  });
}(jQuery, window._, window.document, window));
