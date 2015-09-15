;(function ($, _, document, window, undefined) {

  TasksAPI = function() {
    this.blockUI = function() {
      var p = foswiki.preferences;
      var url = [
        p.PUBURLPATH,
        '/',
        p.SYSTEMWEB,
        '/TasksAPIPlugin/assets/ajax-loader.gif'
      ];

      swal({
        text: jsi18n.get('tasksapi', 'Please wait...'),
        type: null,
        imageUrl: url.join(''),
        imageSize: '220x19',
        showCancelButton: false,
        showConfirmButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false
      });
    };

    this.unblockUI = function() {
      swal.closeModal();
    };
  };

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
      self.isTaskClicked = false;
      this.tasksPanel = new TasksPanel($this);

      $this.on('click', '.task > .close', closeTask);
      $this.on('click', '.task', function() {
        if ( self.isTaskClicked ) {
          return false;
        }

        self.isTaskClicked = true;
        self.tasksPanel.viewTask($(this));
        setTimeout(function() {
          self.isTaskClicked = false;
        }, 200);
      });
      $this.on('click', '> .filter .tasks-btn-create', function() {
        self.tasksPanel.createTask();
      });

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

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        var url = getViewUrl() + '?state=' + $select.val();
        window.location = url;
      };

      $status.on( 'change', handleStatusFilterChanged );
      self.tasksPanel.on( 'afterSave', function( evt, task ) {
        var pid = task.fields.Parent.value;
        var isClose = task.fields.Status.value === 'closed';
        var $task = $(createTaskElement(task));
        var $nextActive = $task;

        var $existing = opts.container.children('.task').filter( function() {
          return $(this).data('id') === $task.data('id');
        });

        if ( $existing.length > 0 ) {
          if ( !isClose || /(1|on|true|enabled)/i.test(opts.keepclosed) ) {
            $existing.replaceWith($task);
          } else {
            var $next = $existing.next();
            $nextActive = $next;
            $existing.remove();
            if ($next.hasClass('task-children-container')) {
              $nextActive = $next.next();
              $next.remove();
            }
          }
        } else {
          opts.container.append($task);
        }

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
        self.tasksPanel.viewTask($nextActive);
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

  var closeTask = function() {
    if ( $(this).find('i.closed').length > 0 ) {
      return false;
    }

    var $task = $(this).closest('.task');
    var $next = $task.next();

    var closeTxt = jsi18n.get('tasksapi', 'Do you want to close this entry?');
    var cmtTxt = jsi18n.get('tasksapi', 'Comment');
    var html = [
      closeTxt,
      '<br><div style="float: left; margin: 12px 0 0 30px;"><small>',
      cmtTxt,
      '</small></div><div style="clear: both"></div><textarea style="width: 400px;" name="Comment" rows="4" cols="50"></textarea><br><br>'
    ].join('');

    swal({
      title: jsi18n.get('tasksapi', 'Are you sure?'),
      html: html,
      type: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#6CCE86',
      cancelButtonColor: '#BDBDBD',
      confirmButtonText: jsi18n.get('tasksapi', 'Yes'),
      cancelButtonText: jsi18n.get('tasksapi', 'No'),
      closeOnConfirm: false
    }, function(confirmed) {
      if (confirmed) {
        var $dialog = $('.sweet-alert.show-sweet-alert.visible');
        var comment = $dialog.find('textarea[name="Comment"]').val();
        var payload = {
          id: $task.data('id'),
          Status: 'closed'
        };

        if ( !/^[\s\n\r]*$/.test(comment) ) {
          payload.comment = comment;
        }

        var opts = $task.closest('.tasktracker').data('tasktracker_options');
        for (var prop in opts) {
          if ( /template|form/.test(prop) ) {
            payload[prop] = opts[prop];
          }
        }

        $.blockUI();
        $.taskapi.update(payload).fail(error).done(function(response) {
          if ( /(1|on|true|enabled)/i.test(opts.keepclosed) ) {
            var $newTask = createTaskElement(response.data);
            $task.replaceWith($newTask);
          } else {
            $task.remove();
            if ($next.hasClass('task-children-container')) {
              $next.remove();
            }
          }

          swal({
            type: 'success',
            title: jsi18n.get('tasksapi', 'Done!'),
            text: jsi18n.get('tasksapi', 'The entry has been marked as closed'),
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
    var $tracker = $('.tasktracker').tasksGrid();
    window.tasksapi = new TasksAPI();

    setTimeout(function() {
      if ( window.location.search ) {
        var match = window.location.search.match(/id=([^&;]+)(;|&|$|.*)/);
        if ( match && match.length > 1 ) {
          var id = match[1];
          var $task = $tracker.find('.task:visible');
          if ( $task.data('id') === id ) {
            $tracker[0].tasksPanel.viewTask($task);
          }
        }
      }
    }, 300);
  });
}(jQuery, window._, window.document, window));
