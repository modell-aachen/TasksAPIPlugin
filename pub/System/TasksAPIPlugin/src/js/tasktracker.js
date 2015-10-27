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
      self.tasksPanel = new TasksPanel($this);

      $('body').on('keydown', '.sweet-alert', function(e) {
        if ($(e.target).is('[contenteditable="true"]')) {
          e.stopPropagation();
          return;
        }

        // ignore all keys except ENTER, ESC
        if (e.which !== 13 && e.which !== 27)
          return false;
      });

      $this.on('mouseenter', '.task > td.close', function() {
        var $i = $(this).find('> span > i');
        if ( $i.hasClass('closed') ) {
          $i.removeClass('fa-check-square').addClass('fa-square-o');
        } else {
          $i.removeClass('fa-square-o').addClass('fa-check-square-o');
        }
      });
      $this.on('mouseleave', '.task > td.close', function() {
        var $i = $(this).find('> span > i');
        if ( $i.hasClass('closed') ) {
          $i.removeClass('fa-square-o').addClass('fa-check-square');
        } else {
          $i.removeClass('fa-check-square-o').addClass('fa-square-o');
        }
      });

      $this.children('.pagination-container').on('click', 'li a', handlePager);
      $this.on('click', '.task > .close', toggleTaskState);
      $this.on('click', '.task', function(evt) {
        if ( $(evt.target).closest('.expander').length === 1 ) {
          toggleTaskExpand.call(evt.target, evt);
          return false;
        }

        if ($(evt.target).is('a')) {
          return;
        }

        var $task = $(this);
        if (!$task.data('id') || !$task.data('task_data')) {
          var raw = $task.find('> .task-data-container > .task-data').text();
          var task = $.parseJSON(raw);
          initTaskElement($task, task);
        }

        if (evt.ctrlKey && evt.shiftKey) {
          if (window.console && console.log) {
           var id = $task.data('id');
           var json = $task.data('task_data');
            console.log(id, json);
          }
        }

        if ( self.isTaskClicked ) {
          return false;
        }

        self.isTaskClicked = true;
        self.tasksPanel.viewTask($task);
        setTimeout(function() {
          self.isTaskClicked = false;
        }, 200);
      });

      $this.on('click', '> .filter .tasks-btn-create', function() {
        self.tasksPanel.createTask(self.opts.parent);
        return false;
      });

      $this.on('click', '.task-new', function() {
        var $self = $(this);
        var $cnt = $(this).closest('.task-children-container');
        var $task = $cnt.prev();
        if ( $task.is('.task.expanded') ) {
          var parent = $task.data('id');
          self.tasksPanel.createTask(parent);
        }

        return false;
      });

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      self.opts = $.parseJSON( json );

      self.opts.cntHeight = $this.height();
      self.opts.container = $this.children('.tasks-table').children('.tasks');

      self.opts.currentState = 'open';
      $this.data('tasktracker_options', self.opts);

      if ( /^(1|on|true|enabled?)$/i.test(self.opts.sortable) ) {
        $this.find('> .tasks-table > thead th').each(function() {
          var $th = $(this);
          var sortby = $th.data('sort');
          if ( !sortby ) {
            return;
          }

          $th.addClass('sortable');
          $th.on('click', doSort);

          if ( self.opts.order === sortby ) {
            $th.addClass(/^(1|on|true|enabled?)$/i.test(self.opts.desc) ? 'desc' : 'asc');
          }
        });
      }

      var $tasks = self.opts.container;
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');

      var params = parseQueryParams();
      if ( params.state ) {
        self.opts.currentState = params.state;
        $status.val(params.state);
      }

      loadTasks( $this, self.opts.currentState, true );

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        var url = getViewUrl() + '?state=' + $select.val();

        if ( typeof window.location.hash === typeof '' && /jqTab/.test(window.location.hash) ) {
          var tabId = window.location.hash.replace('!', '');
          var $tab = $(tabId);
          var cls = $tab.attr('class');
          var tab = cls.replace(/(current|jqTab)/, '');
          url += '&tab=' + tab;
        }
        window.location = url;
      };

      $status.on( 'change', handleStatusFilterChanged );
      var findTask = function(id) {
        return self.opts.container.find('.task:visible').filter( function() {
          return $(this).data('id') === id;
        });
      };

      self.tasksPanel.on( 'afterSave', function( evt, task ) {
        var $task = $(createTaskElement(task));
        var $existing = findTask($task.data('id'));
        var $next = $existing.next();

        if ( task.fields.Status.value === 'deleted' ) {
          if ( $existing.hasClass('expanded') ) {
            $existing.next().remove();
          }

          $next = self.tasksPanel.next();
          $existing.remove();
          self.tasksPanel.viewTask($next);
          return false;
        }

        var $nextActive = $task;
        var isClose = task.fields.Status.value === 'closed';

        if ( $existing.length > 0 ) {
          if ( !isClose || /(1|on|true|enabled)/i.test(self.opts.keepclosed) ) {
            if ( $existing.hasClass('expanded') ) {
              $task.addClass('expanded');
              var span = $task.children('td').length;
              var $children = $task.children('.task-children').children('table.children').detach();
              var $new = $('<tr class="task-children-container"><td class="dashed-line" colspan="' + span + '"></td></tr>');
              $new.children('td').append($children);
              $next.replaceWith($new);
            }

            $existing.replaceWith($task);
          } else {
            $nextActive = $next;
            $existing.remove();
            if ($next.hasClass('task-children-container')) {
              $nextActive = $next.next();
              $next.remove();
            }
          }
        } else {
          if ( task.fields.Parent.value ) {
            var $parent = findTask(task.fields.Parent.value);
            var $childContainer = $parent.next();
            if ( !$childContainer.hasClass('task-children-container') ) {
              // TBD. is this even possible?
              return false;
            }

            $task.insertBefore($childContainer.find('> td > table > tbody > .task-new'));
          } else {
            self.opts.container.append($task);
          }
        }

        // view task
        self.tasksPanel.viewTask($nextActive);
      });

      return this;
    });
  };

  var toggleTaskExpand = function(evt) {
    var $col = $(this).closest('.expander');
    var $row = $col.parent();
    $row.toggleClass('expanded');

    if ( $row.hasClass('expanded') ) {
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

    window.tasksapi.blockUI();
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
      window.tasksapi.unblockUI();
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

  var getMappedState = function(trackeropts, taskstate) {
    if ( trackeropts.mapping && trackeropts.mapping.field) {
      var field = trackeropts.mapping.field;
      var mappings = trackeropts.mapping.mappings[taskstate];
      if ( mappings && mappings.length > 0 ) {
        return {field: field, value: mappings[0]};
      }
    }

    return undefined;
  };

  var toggleTaskState = function() {
    var deferred = $.Deferred();
    var $task = $(this).closest('.task');
    var isOpen = $task.data('task_data').fields.Status.value === 'open';
    var $next = $task.next();

    var opts = $task.closest('.tasktracker').data('tasktracker_options');
    var payload = {
      id: $task.data('id'),
    };

    for (var prop in opts) {
      if ( /template|form|flavor|depth/.test(prop) ) {
        payload[prop] = opts[prop];
      }
    }

    if ( isOpen ) {
      var closeTxt = jsi18n.get('tasksapi', 'Do you want to close this entry?');
      var cmtTxt = jsi18n.get('tasksapi', 'Comment');
      var html = [
        closeTxt,
        '<br><div style="float: left; margin: 15px 0 0 3px;"><small>',
        cmtTxt,
        '</small></div><div style="clear: both"></div><div name="comment" contenteditable="true"></div><br><br>'
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
          payload.Status = 'closed';
          var $dialog = $('.sweet-alert.show-sweet-alert.visible');
          var comment = $dialog.find('div[name="comment"]').html();
          if ( !/^[\s\n\r]*$/.test(comment) ) {
            payload.comment = comment;
          }

          var mappedState = getMappedState(opts, 'closed');
          if ( !_.isUndefined(mappedState) ) {
            payload[mappedState.field] = mappedState.value;
          }

          deferred.resolve(payload);
        } else {
          deferred.reject();
        }

        return confirmed;
      });
    } else {
      payload.Status = 'open';
      var mappedState = getMappedState(opts, 'open');
      if ( !_.isUndefined(mappedState) ) {
        payload[mappedState.field] = mappedState.value;
      }

      deferred.resolve(payload);
    }

    deferred.promise().done(function(data) {
      window.tasksapi.blockUI();
      // Hotfix. (ToDo)
      data._depth = data.depth ? data.depth : 0;

      $.taskapi.update(data).done(function(response) {
        if ( /(1|on|true|enabled)/i.test(opts.keepclosed) ) {
          var $newTask = createTaskElement(response.data);
          if ( $task.hasClass('expanded') ) {
            $newTask.addClass('expanded');
            var span = $newTask.children('td').length;
            var $children = $newTask.children('.task-children').children('table.children').detach();
            var $new = $('<tr class="task-children-container"><td class="dashed-line" colspan="' + span + '"></td></tr>');
            $new.children('td').append($children);
            $next.replaceWith($new);
          }

          $task.replaceWith($newTask);
        } else {
          $task.remove();
          if ($next.hasClass('task-children-container')) {
            $next.remove();
          }
        }

        window.tasksapi.unblockUI();
        setTimeout(function() {
          swal({
            type: 'success',
            title: jsi18n.get('tasksapi', 'Done!'),
            text: jsi18n.get('tasksapi', isOpen ? 'The entry has been marked as closed' : 'The entry has been reopened'),
            timer: 1500,
            showConfirmButton: false,
            showCancelButton: false
          });
        }, 250);
      }).fail(function(err) {
        error(err);
        window.tasksapi.unblockUI();
      });
    });

    return false;
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

  var doSort = function() {
    var $th = $(this);
    var order = $th.data('sort');
    if ( !order ) {
      return false;
    }

    var isDesc = $th.hasClass('asc') || !$th.hasClass('desc');
    var $tracker = $th.closest('.tasktracker');
    var $table = $tracker.children('.tasks-table');
    $table.find('> thead th').removeClass('asc desc');
    var tid = $tracker.attr('id').replace('#', '');
    $th.addClass(isDesc ? 'desc' : 'asc');

    var query = parseQueryParams();
    query.order = order;
    query.desc = isDesc ? 1 : 0;
    query.tid = tid;

    if ( $tracker.children('.pagination-container').length > 0 ) {
      query.page = $tracker.find('ul.pagination li.current').text().replace(/\s/g, '');
    }

    var $tab = $th.closest('.jqTab.current');
    if ( $tab.length > 0 ) {
      var cls = $tab.attr('class');
      query.tab = cls.replace(/\s|jqTab|current/g, '');
    }

    var search = [];
    for(var p in query) {
      if ( !_.isUndefined(p) && !_.isUndefined(query[p]) ) {
        search.push(p + '=' + query[p]);
      }
    }

    $tracker.find('ul.pagination').children('li').each(function() {
      var $li = $(this);
      var $a = $li.children('a');
      var href = $a.attr('href');

      if ( /order=[^&]+/.test(href) ) {
        href = href.replace(/order=[^&]+/, 'order=' + query.order);
      } else {
        href += '&order=' + query.order;
      }

      if ( /desc=[^&]+/.test(href) ) {
        href = href.replace(/desc=[^&]+/, 'desc=' + query.desc);
      } else {
        href += '&desc=' + query.desc;
      }
      $a.attr('href', href);
    });

    var url = window.location.pathname + '?' + search.join('&');
    var target = url + ' #' + tid + '> .tasks-table > .tasks > .task';
    window.tasksapi.blockUI();
    $table.children('.tasks').load(target, function() {
      window.tasksapi.unblockUI();
    });

    return false;
  };

  var handlePager = function() {
    var $this = $(this);
    if ( $this.hasClass('disabled') || $this.parent().hasClass('disabled')) {
      return false;
    }

    var $ul = $this.closest('ul');
    var $first = $ul.children('li').first();
    var $last = $ul.children('li').last();
    var $current = $ul.children('li.active').removeClass('active');
    var url = $current.children('a').attr('href');

    if ( $this.parent()[0] === $first[0] ) {
      var $prev = $current.prev().addClass('active');
      url = url.replace('page=' + $current.text().replace(/\s/g, ''), 'page=' + $prev.text().replace(/\s/g, ''));
    } else if ( $this.parent()[0] === $last[0] ) {
      var $next = $current.next().addClass('active');
      url = url.replace('page=' + $current.text().replace(/\s/g, ''), 'page=' + $next.text().replace(/\s/g, ''));
    } else {
      url = $this.attr('href');
      $this.parent().addClass('active');
    }

    var total = $ul.children('li').length;
    $ul.children('li').each(function(i) {
      if ( !$(this).hasClass('active') ) {
        return;
      }

      if ( i > 1 ) {
        $first.removeClass('disabled');
      }
      if ( i === 1 ) {
        $first.addClass('disabled');
      }
      if ( i + 2 === total ) {
        $last.addClass('disabled');
      } else {
        $last.removeClass('disabled');
      }
    });

    var $tab = $this.closest('.jqTab.current');
    if ( $tab.length > 0 ) {
      var cls = $tab.attr('class').replace(/(\s|jqTab|current)/g, '');
      url += '&tab=' + cls;
    }

    var tid = $this.closest('.tasktracker').attr('id');
    var target = url + ' #' + tid + '> .tasks-table > .tasks > .task';
    window.tasksapi.blockUI();
    $this.closest('.tasktracker').find('> .tasks-table > .tasks').load(target, function() {
      window.tasksapi.unblockUI();
    });

    return false;
  };


  $(document).ready( function() {
    if (CKEDITOR) {
      CKEDITOR.disableAutoInline = true;
    }

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
