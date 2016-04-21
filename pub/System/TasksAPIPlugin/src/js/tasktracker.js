;(function ($, _, document, window, undefined) {

  TasksAPI = function() {
    this.blockUI = function() {
      var p = foswiki.preferences;
      var url = [
        p.PUBURL,
        '/',
        p.SYSTEMWEB,
        '/TasksAPIPlugin/assets/ajax-loader.gif'
      ];

      var txt = jsi18n.get('tasksapi', 'Please wait...')
      $.blockUI({
        css: {
          backgroundColor: '#fff',
          color: '#000',
          height: '40px',
          'z-index': 15000
        },
        message: '<div><strong>' + txt+ '</strong></div><img border="0" width="220" height="19" src="' + url.join('') + '" />'
      });
    };

    // wrap method for compatibility reasons
    this.unblockUI = function() {
      $.unblockUI();
    };
  };

  $.fn.tasksGrid = function(fnOpts) {
    if ( typeof _ === typeof undefined ) {
      error( "Missing dependency underscore.js");
      return this;
    }

    return this.each(function() {
      var $this = $(this);
      if ( !$this.hasClass('tasktracker') ) {
        return this;
      }

      var self = this;
      self.isTaskClicked = false;
      self.tasksPanel = new TasksPanel($this);

      $('body').off('keydown', '.sweet-alert');
      $('body').on('keydown', '.sweet-alert', function(e) {
        if ($(e.target).is('[contenteditable="true"]')) {
          e.stopPropagation();
          return;
        }

        // ignore all keys except ENTER, ESC
        if (e.which !== 13 && e.which !== 27)
          return false;
      });

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      self.opts = $.parseJSON( json );

      self.opts.cntHeight = $this.height();
      self.opts.container = $this.children('.tasks-table').children('.tasks');

      var curstate = 'open';
      if (typeof self.opts.query === typeof '') {
        try {
          json = $.parseJSON(self.opts.query);
          if (typeof json.Status === typeof '') {
            curstate = json.Status;
          }
        } catch (e) {
          erorr(e);
        }
      }

      self.opts.currentState = curstate;
      $this.data('tasktracker_options', self.opts);

      var $tasks = self.opts.container;
      var $status = $this.find('> .filter select[name="Status"]');

      var params = parseQueryParams();
      if ( params.f_Status || params.state ) {
        self.opts.currentState = params.f_Status || params.state;
        $status.val(params.f_Status || params.state);
      }

      loadTasks( $this, self.opts.currentState, true );
      if ( /^(1|on|true|enabled?)$/i.test(self.opts.sortable) ) {
        $this.find('> .tasks-table > thead th').each(function() {
          var $th = $(this);
          var sortby = $th.data('sort');
          if ( !sortby ) {
            return;
          }

          $th.addClass('sortable');
          $th.off('click', doSort);
          $th.on('click', doSort);

          if ( self.opts.order === sortby ) {
            $th.addClass(/^(1|on|true|enabled?)$/i.test(self.opts.desc) ? 'desc' : 'asc');
          }
        });
      }

      $this.children('.pagination-container').off('click', 'li a', handlePager);
      $this.children('.pagination-container').on('click', 'li a', handlePager);

      // reinit: keep all events attached to .tasktracker
      if (fnOpts === 'reinit' || (typeof fnOpts === 'object' && fnOpts.reinit === true)) {
        return this;
      }

      // Detach all possibly existing event handlers.
      $this.off();

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
        verifyTaskInitialized($task);

        if (evt.ctrlKey && evt.shiftKey) {
          if (window.console && console.log) {
           var id = $task.data('id');
           var json = $task.data('task_data');
            console.log(id, json);
          }

          if (evt.altKey) {
            return false;
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

      var findTask = function(id) {
        return self.opts.container.find('.task:visible').filter( function() {
          return $(this).data('id') === id;
        });
      };

      $this.on( 'afterSave', function( evt, task ) {
        if (evt.ignoreSelf) {
          return;
        }

        var $task = $(createTaskElement(task));
        var $existing = findTask($task.data('id'));
        var $next = $existing.next();

        var ctxChanged = !!$existing.length && $existing.data('task_data').fields.Context.value !== $task.data('task_data').fields.Context.value;
        if ( task.fields.Status.value === 'deleted' || ctxChanged ) {
          if ( $existing.hasClass('expanded') ) {
            $next.remove();
          }

          self.tasksPanel.next();
          $existing.remove();
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

      if (params.id && params.tid == self.opts.id) {
        var $task = self.opts.container.find('.task').filter(function() {
          return $(this).data('id') === params.id;
        });

        if ($task.length) {
          self.tasksPanel.viewTask($task);
        } else {
          hintNoAccess();
        }
      }

      if (params.type === 'invalid') {
        hintNoAccess();
      }

      return this;
    });
  };

  var hintNoAccess = function() {
    swal({
      type: 'warning',
      title: jsi18n.get('tasksapi', 'Oops'),
      text: jsi18n.get('tasksapi', "Seems you're trying to open a task which doesn't exist anymore or you don't have sufficient access permissions to view that task."),
      showConfirmButton: true,
      showCancelButton: false
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
      if ( !json.Status && opts.currentState ) {
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
    }).fail(function(xhr, status, err) {
      deferred.reject();
      error(xhr, status, err);
    });

    return deferred.promise();
  };

  var verifyTaskInitialized = function($task) {
    if (!$task.data('id') || !$task.data('task_data')) {
      var raw = $task.find('> .task-data-container > .task-data').text();
      var task = $.parseJSON(raw);
      initTaskElement($task, task);
    }
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

    swal({
      type: 'error',
      title: jsi18n.get('tasksapi', 'Oops'),
      text: jsi18n.get('tasksapi', 'Something went wrong! Try again later.'),
      showConfirmButton: true,
      showCancelButton: false
    });
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

  var toggleTaskState = function(evt) {
    var deferred = $.Deferred();
    var $task = $(this).closest('.task');
    verifyTaskInitialized($task);

    var isOpen = $task.data('task_data').fields.Status.value === 'open';
    var $next = $task.next();

    var $tracker = $task.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    var payload = {
      id: $task.data('id'),
    };

    for (var prop in opts) {
      if ( /template|form|flavor|depth/.test(prop) ) {
        payload[prop] = opts[prop];
      }
    }

    if ( !evt.ctrlKey && isOpen ) {
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
        closeOnConfirm: true
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
      var state = isOpen ? 'closed' : 'open';
      payload.Status = state
      var mappedState = getMappedState(opts, state);
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
          var afterSave = $.Event('afterSave', {ignoreSelf: true});
          $tracker.trigger(afterSave, $newTask.data('task_data'));
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
      }).fail(function(xhr, status, err) {
        error(xhr, status, err);
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
    var arr = q.split(/[&;]/);
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
      query.tab = cls.replace(/\s|jq(Ajax)?Tab|current|\{[^\}]*\}/g, '');
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

    var $filter = $tracker.children('.filter').first();
    var opts = $tracker.data('tasktracker_options');
    var filter = readFilter.call($filter);
    var qfilter = stringifyFilter(opts, filter);

    var url = opts.updateurl ? opts.updateurl : window.location.pathname;
    url += (/\?/.test(url) ? '&' : '?') + search.join('&') + '&' + qfilter;
    var target = url + ' #' + tid + '> .tasks-table > .tasks > .task';
    window.tasksapi.blockUI();
    $table.children('.tasks').load(target, function(resp, status, xhr) {
      window.tasksapi.unblockUI();

      if (status === 'error') {
        error(status, resp, xhr);
        return;
      }

      var $tracker = $(this).closest('.tasktracker');
      var loaded = $.Event('tasksLoaded');
      $tracker.trigger(loaded);
    });

    return false;
  };

  var applyFilter = function() {
    var $filter = $(this);
    var $tracker = $filter.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    var filter = readFilter.call($filter.closest('.filter'));
    var url = opts.updateurl ? opts.updateurl : window.location.pathname;
    url += (/\?/.test(url) ? '&' : '?') + stringifyFilter(opts, filter);
    var target = url + ' #' + opts.id + '> .tasks-table > .tasks > .task';
    window.tasksapi.blockUI();
    $('<div></div>').load(target, function(res, status, xhr) {
      if (status === 'error') {
        error(status, res, xhr);
        return;
      }

      var $doc = $('<div></div>').append($.parseHTML(res));
      var $newTracker = $doc.find('#' + opts.id);
      $newTracker.children('.filter').replaceWith($tracker.children('.filter').detach());
      $tracker.empty().append($newTracker.children());
      $tracker.tasksGrid('reinit');

      window.tasksapi.unblockUI();

      var loaded = $.Event('tasksLoaded');
      $tracker.trigger(loaded);
    });

    return false;
  };

  var stringifyFilter = function(trackeropts, filter) {
    var params = ['tid=' + trackeropts.id];

    // respect query params (but ignore 'state')
    var qparams = parseQueryParams();
    ['pagesize', 'tab'].forEach(function(k) {
      if (k in qparams) {
        params.push(k + '=' + qparams[k]);
      }
    });

    // keep sort order
    var $tracker = $('#' + trackeropts.id);
    $tracker.find('> .tasks-table > thead .sortable.desc[data-sort], .sortable.asc[data-sort]').each(function(){
      var $sort = $(this);
      if ($sort.length) {
        params.push('order=' + $sort.data('sort'));
        var desc = $sort.is('.desc') ? 1 : 0;
        params.push('desc=' + desc);
      }
    });

    // stringify
    for (var p in filter) {
      if (typeof filter[p] === 'object') {
        if (filter[p].type === 'range') {
          params.push('f_' + p + '_r=' + filter[p].from + '_' + filter[p].to);
        } else if (filter[p].type === 'like') {
          params.push('f_' + p + '_l=' + filter[p].substring);
        }
      } else {
        params.push('f_' + p + '=' + filter[p]);
      }
    }

    return params.join('&');
  };

  var resetFilter = function() {
    var $tracker = $(this).closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    var query = $.parseJSON(opts.query);

    $tracker.children('.filter').find('input, select').each(function() {
      var $filter = $(this);
      $filter.val('')
      if ($filter.is('input')) {
        if ($filter.data('default')) {
          $filter.val($filter.data('default'));
        }
      }

      if ($filter.is('select')) {
        $filter.children('option').each(function() {
          var $o = $(this);
          $o.removeAttr('selected');
          if ($o.data('default')) {
            $o.attr('selected', 'selected');
            $filter.val($o.val());
          }
        });
      }
    });

    $tracker.find('.btn-filter.btn-apply').trigger('click');
    return false;
  };

  var readFilter = function() {
    var q = {};
    $(this).find('input[name], select[name]').each(function() {
      var $filter = $(this);
      var name = $filter.attr('name');
      if (!name || /^\s*$/.test(name)) {
        return;
      }

      var val = $filter.val();
      if (!val || /^\s*$/.test(val)) {
        return;
      }

      if (/-/.test(name)) {
        var type = /like$/.test(name) ? 'like' : 'range';
        var aname = name.replace(/-(from|to|like)/, '');
        if (!q[aname]) {
          q[aname] = {type: type};
        }

        if (q[aname].type === 'range') {
          q[aname].hasTo = $('input[name="' + aname + '-to"]').length > 0;
          if (/-from$/.test(name)) {
            q[aname].from = parseInt(val);
          } else {
            q[aname].to = parseInt(val);
          }
        } else {
          q[aname].substring = val;
        }
      } else {
        q[name] = val
      }
    });

    // Fix 'from' and 'to' fields:
    // When filtering by date (epoch) we need to make sure to ignore an epoch's
    // time component.
    for (var p in q) {
      if (typeof q[p] !== 'object' || q[p].type !== 'range') {
        continue;
      }

      if (q[p].from) {
        var from = new Date();
        from.setTime(q[p].from * 1e3);
        from.setHours(0);
        from.setMinutes(0);
        from.setSeconds(0);
        q[p].from = Math.round(from.getTime()/1e3);
      } else {
        q[p].from = 0;
      }

      var to = new Date();
      if (q[p].to) {
        to.setTime(q[p].to * 1e3);
      } else {
        // if there's no input field to specify the "to-date",
        // just set it to the same day as the "from-date".
        // Otherwise, if the user left that field empty, we gonna
        // select today's date
        if (!q[p].hasTo) {
          to.setTime(q[p].from * 1e3)
        }
      }

      to.setHours(23);
      to.setMinutes(59);
      to.setSeconds(59);
      q[p].to = Math.round(to.getTime()/1e3);
    }

    return q;
  };

  var handlePager = function() {
    var $this = $(this);
    if ( $this.hasClass('disabled') || $this.parent().hasClass('disabled')) {
      return false;
    }

    var page, tab, url;
    var $ul = $this.closest('ul');
    var showAll = $ul.hasClass('show-all');
    if (showAll) {
      url = $this.attr('href');
    } else {
      var $first = $ul.children('li').first();
      var $last = $ul.children('li').last();
      var $current = $ul.children('li.active').removeClass('active');
      url = $current.children('a').attr('href');

      if ( $this.parent()[0] === $first[0] ) {
        var $prev = $current.prev().addClass('active');
        page = $prev.text().replace(/\s/g, '');
        url = url.replace('page=' + $current.text().replace(/\s/g, ''), 'page=' + page);
      } else if ( $this.parent()[0] === $last[0] ) {
        var $next = $current.next().addClass('active');
        page = $next.text().replace(/\s/g, '');
        url = url.replace('page=' + $current.text().replace(/\s/g, ''), 'page=' + page);
      } else {
        url = $this.attr('href');
        page = url.match(/(?:page=(\d+))/)[1];
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
    }

    var $tab = $this.closest('.jqTab.current');
    if ( $tab.length > 0 ) {
      var cls = $tab.attr('class').replace(/(\s|jq(Ajax)?Tab|current|\{[^\}]*\})/g, '');
      tab = '&tab=' + cls;
    }

    var $tracker = $this.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');
    var tid = $tracker.attr('id');
    if (opts.updateurl) {
      if (showAll) {
        url = opts.updateurl + '&page=1&pagesize=-1&tid=' + tid;
      } else {
        url = opts.updateurl + '&page=' + page + '&tid=' + tid;
      }

      if (tab) {
        url += '&tab=' + tab;
      }
    }

    var target = url + ' #' + tid + '> .tasks-table > .tasks > .task';
    window.tasksapi.blockUI();
    $tracker.find('> .tasks-table > .tasks').load(target, function(resp, status, xhr) {
      window.tasksapi.unblockUI();

      if (status === 'error') {
        error(status, resp, xhr);
        return;
      }

      $tracker.find('> .tasks-table > .tasks > .task').each(function() {
        verifyTaskInitialized($(this));
      });

      var loaded = $.Event( 'tasksLoaded' );
      $tracker.trigger(loaded);

      if (showAll) {
        $ul.parent().css('display', 'none');
      }
    });

    return false;
  };

  // For now we only support exporting the first (visible) grid on a page.
  var exportPDF = function() {
    $(this).on('submit', function() {
      var $form = $(this);
      var $tracker = $('.tasktracker:visible').first();
      var opts = $tracker.data('tasktracker_options');
      var $tabPane = $tracker.closest('.jqTabPane');
      var isTabbed = $tabPane.length !== 0;

      var $filter = $tracker.children('.filter').first();
      var filter = readFilter.call($filter.closest('.filter'));
      delete filter.id;
      delete filter.tab;
      delete filter.tid;

      var query = stringifyFilter(opts, filter);
      if (isTabbed) {
        var $li = $tabPane.find('> ul.jqTabGroup > li.current');
        var id = $li.children('a').attr('data');
        var $pane = $('#' + id);
        var tabId = $pane.attr('class');
        tabId = tabId.replace(/\s|current|jq(Ajax)?Tab|\{[^\}]*\}/g, '');
        if (/tab=[^;&]+/.test(query)) {
          query = query.replace(/tab=[^;&]+/, 'tab=' + tabId);
        } else {
          query += '&tab=' + tabId;
        }
      }

      _.each(query.split(/&/), function(param) {
        var arr = param.split(/=/);
        var name = arr[0];
        var val = arr[1];

        $form.find('input[name="' + name + '"]').remove();
        var $in = $('<input type="hidden" name="' + name + '" value="' + val + '" />')
        $in.appendTo($form);
      });
    });
  };

  $(document).ready( function() {
    if (CKEDITOR) {
      CKEDITOR.disableAutoInline = true;
    }

    $(document).on('click', '.tasktracker .btn-filter.btn-apply', applyFilter);
    $(document).on('click', '.tasktracker .btn-filter.btn-reset', resetFilter);

    $('.tasktracker').livequery(function() { $(this).tasksGrid(); });
    window.tasksapi = new TasksAPI();

    // Listen for PDF exports
    $('#printDialogForm').livequery(exportPDF);
  });
}(jQuery, window._, window.document, window));
