;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.tasksGrid = function() {
    if ( typeof _ === typeof undefined ) {
      error( "Missing dependency underscore.js");
      return this;
    }

    return this.each(function () {
      var $this = $(this);
      if ( !$this.hasClass('tasktracker') ) {
        return this;
      }

      var self = this;
      this.tasksPanel = new TasksPanel($this);

      $this.on('click', '.task > .close', closeTask);
      $this.on('click', '.task', function() {
        self.tasksPanel.viewTask($(this));
      });
      $this.on('click', '> .filter .tasks-btn-create', function() {
        self.tasksPanel.createTask();
      });

    // $('.tasks .task').on('click', '.expander', toggleTaskExpand);

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      var opts = $.parseJSON( json );

      opts.cntHeight = $this.height();
      opts.container = $this.children('.tasks-table').children('.tasks');

      opts.currentState = 'open';
      $this.data('tasktracker_options', opts);

      var $tasks = opts.container;
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');

      var params = parseQueryParams();
      if ( params.state ) {
        opts.currentState = params.state;
        $status.val(params.state);
      }

      loadTasks( $this, opts.currentState, true );

      if ( opts.infinite ) {
        var isLoading = false;
        var infiniteScroll = function() {
          if ( isLoading ) {
            return;
          }

          var top = $(window).scrollTop();
          var dh = $(document).height();
          var wh = $(window).height();
          var  trigger = 0.80;

          if ( (top/(dh-wh)) > trigger ) {
            var rowCnt = $this.find('> .tasks-table > tbody > tr').length;
            if ( rowCnt >= opts.totalsize ) {
              isLoading = false;
              return false;
            }

            var url = getViewUrl() + '?page=' + Math.round(rowCnt/opts.pagesize + 0.5);
            if ( params.state ) {
              url += '&state=' + params.state;
            }

            $('<div class="tasks-tmp-container" style="display: none"></div>').appendTo('body');
            $.blockUI();
            isLoading = true;
            $('.tasks-tmp-container').load(url + ' #' + id, function(response) {
              var $tmp = $(this);
              var $rows = $tmp.find('#' + id + '> .tasks-table > tbody > tr');
              if ( $rows.length < opts.pagesize ) {
                $(window).off('scroll', infiniteScroll);
              }

              $rows.each(function() {
                var $task = $(this).detach();
                var $data = $task.find('> .task-data-container > .task-data');
                if ( $data.length > 0 ) {
                  var data = unescapeHTML( $.parseJSON($data.text()) );
                  data.html = $('<div></div>').append($task).html();
                  opts.container.append( createTaskElement(data) );
                }
              });

              isLoading = false;
              $tmp.remove();

              if ( opts.sortable ) {
                invokeTablesorter.call($this.children('.tasks-table'), false, true);
              }

              $.unblockUI();
            });
          }
        };

        $(window).on( 'scroll', infiniteScroll);
      }

      // var handleCreate = function() {
      //   var qopts = {};
      //   $.extend(qopts, opts);
      //   qopts.trackerId = opts.id;
      //   qopts._depth = parseInt(opts.depth);

      //   delete qopts.id;
      //   delete qopts.depth;

      //   var $self = $(this);
      //   var parent;
      //   if ( $self.hasClass('task-new') ) {
      //     qopts.$table = $self.parent();
      //     var $parent = $self.closest('.task-children-container').prev();
      //     parent = $parent.data('id');
      //     if ( parent ) {
      //       qopts.parent = parent;

      //       var pdata = $parent.data('task_data');
      //       qopts._depth = parseInt(pdata.depth) - 1;
      //     }
      //   } else {
      //     qopts.$table = $(opts.container);
      //   }

      //   var beforeCreate = $.Event( 'beforeCreate' );
      //   $this.trigger( beforeCreate, qopts );
      //   if( beforeCreate.isDefaultPrevented() ) {
      //     return false;
      //   }

      //   delete qopts.$table;
      //   delete qopts.container;

      //   var evtResult = beforeCreate.result;
      //   if ( _.isObject( evtResult ) ) {
      //     delete evtResult.id;
      //     delete evtResult.trackerId;
      //     $.extend(qopts, evtResult);
      //   }

      //   // $editor.taskEditor(qopts).done(function(type, data) {
      //   //   if (type === 'save') {
      //   //     var pid = data.fields.Parent.value;
      //   //     if (!parent) {
      //   //       opts.container.append(createTaskElement(data));
      //   //     } else {
      //   //       $(createTaskElement(data)).insertBefore($self);
      //   //     }

      //   //     applyLevels();
      //   //   }
      //   // }).fail(error);

      //   return false;
      // };

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        var url = getViewUrl() + '?state=' + $select.val();
        window.location = url;
      };

      $status.on( 'change', handleStatusFilterChanged );
      self.tasksPanel.on( 'afterSave', function( evt, task ) {
        var pid = task.fields.Parent.value;
        var $task = $(createTaskElement(task));

        // ToDo. re-implement
        // if (!parent) {
          opts.container.append($task);
        // } else {
        //   $task.insertBefore($self);
        // }

        applyLevels();

        if ( $status.length > 0 && task.fields.Status.value !== $status.val() ) {
          $tasks.find('.task').each( function() {
            var $t = $(this);
            if ( $t.data('id') === task.id ) {
              $t.remove();
              return false;
            }
          });
        }

        if ( opts.sortable ) {
          invokeTablesorter.call($this.children('.tasks-table'), true);
        }

        // view task
        self.tasksPanel.viewTask($task);
      });

      if ( opts.sortable ) {
        invokeTablesorter.call($this.children('.tasks-table'));
      }

      applyLevels();
      return this;
    });
  };

  var getViewUrl = function() {
    var p = foswiki.preferences;
    return [
      p.SCRIPTURL,
      '/view',
      p.SCRIPTSUFFIX,
      '/',
      p.WEB,
      '/',
      p.TOPIC
    ].join('');
  };

  var invokeTablesorter = function(forceSort, updateOnly) {
    try {
      var $tbl = $(this);
      if ( !forceSort && $tbl.find('> tbody .task').length === 0 ) {
        return;
      }

      if ( updateOnly ) {
        setTimeout(function() {
          $tbl.trigger('update');
        }, 10);
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
    } catch(e) {
      error(e);
    }
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

  var initTaskElement = function($task, task) {
    $task.data('id', task.id);
    $task.data('task_data', task);
  };

  var createTaskElement = function(task) {
    var $task = $(task.html);
    initTaskElement($task, task);
    return $task;
  };

  // var editClicked = function() {
  //   if (!hoveredTask) {
  //     return false;
  //   }

  //   var $task = hoveredTask;
  //   var edopts = {};

  //   var $tracker = $task.closest('.tasktracker');
  //   var opts = $tracker.data('tasktracker_options');
  //   for(var p in opts ) {
  //     if ( /string|number|boolean/.test( typeof opts[p] ) ) {
  //       edopts[p] = opts[p];
  //     }
  //   }

  //   var task = unescapeHTML( $.parseJSON($task.children('.task-data-container').text()) );
  //   edopts.autoassign = opts.autoassign;
  //   edopts.data = task;
  //   edopts.id = task.id;
  //   edopts.lang = opts.lang;
  //   edopts._depth = task.depth;
  //   edopts.trackerId = $tracker.attr('id');

  //   var expanded = $task.is('.expanded');
  //   $task.addClass('highlight');
  //   $('#task-editor').taskEditor(edopts).done(function(type, data) {
  //     $task.removeClass('highlight');
  //     if (type === 'save') {
  //       if (data.fields.Status.value === 'deleted') {
  //         $task.remove();
  //       } else {
  //         var $newTask = $(createTaskElement(data));
  //         $task.replaceWith( $newTask );

  //         if (expanded) {
  //           $newTask.next().remove();
  //           var $expander = $newTask.children('.expander');
  //           toggleTaskExpand.call($expander);
  //         }
  //       }

  //       applyLevels();
  //     }
  //   }).fail(function(type, msg) {
  //     error(msg);
  //   });
  // };

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

  // var toggleTaskExpand = function(evt) {
  //   var $col = $(this);
  //   var $row = $col.parent();
  //   $row.toggleClass('expanded');

  //   // update tablesorter to respect child rows
  //   var $tbl = $col.closest('.tasks-table:not(.children)');
  //   $tbl.trigger('update');

  //   var isExpanded = $row.hasClass('expanded');
  //   if ( isExpanded ) {
  //     var span = $row.children('td').length;
  //     var $children = $row.children('.task-children').children('table.children').detach();
  //     var $new = $('<tr class="task-children-container"><td class="dashed-line" colspan="' + span + '"></td></tr>');
  //     $new.children('td').append($children);
  //     $new.insertAfter($row);
  //   } else {
  //     var $next = $row.next();
  //     var $table = $next.children('td').children('table.children').detach();
  //     $table.appendTo($row.children('.task-children'));
  //     $next.remove();
  //   }

  //   applyLevels();
  // };

  var closeTask = function() {
    var $task = $(this).closest('.task');
    var $next = $task.next();

    swal({
      title: 'Sind Sie sicher?',
      text: 'Möchten Sie diesen Protokollpunkt schließen?',
      type: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#6CCE86',
      cancelButtonColor: '#BDBDBD',
      confirmButtonText: 'Ja',
      cancelButtonText: 'Nein',
      closeOnConfirm: false
    }, function(confirmed) {
      if (confirmed) {
        var payload = {
          id: $task.data('id'),
          Status: 'closed'
        };

        $.blockUI();
        $.taskapi.update(payload).fail(error).done(function(response) {
          $task.remove();
          if ($next.hasClass('task-children-container')) {
            $next.remove();
          }

          swal({
            type: 'success',
            title: 'Erledigt!',
            text: 'Protokollpunkt wurde als geschlossen markiert.',
            timer: 1500,
            showConfirmButton: false,
            showCancelButton: false
          });
        }).always($.unblockUI);
      }

      return confirmed;
    });

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

  var parseQueryParams = function(query) {
    var q = query || window.location.search || '';
    if ( /^;|#|\?/.test(q) ) {
      q = q.substr(1);
    }

    var retval = {};
    var arr = q.split('&');
    for (var i = 0; i < arr.length; ++i) {
      var p = arr[i].split('=');
      retval[p[0]] = p[1];
    }

    return retval;
  };

  $(document).ready( function() {
    $('.tasktracker').tasksGrid();
  });
}(jQuery, window._, window.document, window));
