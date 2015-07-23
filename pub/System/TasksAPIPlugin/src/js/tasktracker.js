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

      var $tasks = opts.container;
      var $editor = $('#task-editor');
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
                try {
                  invokeTablesorter.call($this.children('.tasks-table'), false, true);
                } catch(e) {
                  error(e);
                }
              }

              $.unblockUI();
            });
          }
        };

        $(window).on( 'scroll', infiniteScroll);
      }

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
          qopts.$table = $self.parent();
          var $parent = $self.closest('.task-children-container').prev();
          parent = $parent.data('id');
          if ( parent ) {
            qopts.parent = parent;

            var pdata = $parent.data('task_data');
            qopts._depth = parseInt(pdata.depth) - 1;
          }
        } else {
          qopts.$table = $(opts.container);
        }

        var beforeCreate = $.Event( 'beforeCreate' );
        $this.trigger( beforeCreate, qopts );
        if( beforeCreate.isDefaultPrevented() ) {
          return false;
        }

        delete qopts.$table;
        delete qopts.container;
        delete qopts.lang;
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
        var url = getViewUrl() + '?state=' + $select.val();
        window.location = url;
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
            invokeTablesorter.call($this.children('.tasks-table'), true);
          } catch(e) {
            error(e);
          }
        }
      });

      if ( opts.sortable ) {
        try {
          invokeTablesorter.call($this.children('.tasks-table'));
        } catch(e) {
          error(e);
        }
      } else {
        // moved here due to perfomance reasons (tablesorter vs mutation observers)
        $this.observe('added', 'tr.task', function(record) {
          detachEventHandler();
          attachEventHandler();
        });
      }

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
    $tbl
      .tablesorter(opts)
      .bind('sortStart', onSortStart)
      .bind('sortEnd', onSortEnd);
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
      sel = 'last';
      func = 'prev';
    } else {
      sel = 'first';
      func = 'next';
    }

    var $task = $(this);
    var $sibling = $task[func]();
    if ( $sibling.hasClass('task-children-container') ) {
      $sibling = $sibling[func]();
    }

    if ( !$sibling.hasClass('task') ) {
      var $children = $task.parent().children(sel);
      $sibling = $task.parent().children('.task')[sel]();
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

      var wh = $(window).height();
      var sy = window.scrollY;
      var ot = $task.offset().top;
      var th = $task.height();

      if ( sy + wh < ot + th || sy > ot ) {
        $('body,html').animate({
          scrollTop: ot - th
        });
      }

      var saveComment = function(evt) {
        var $self = $(this);

        var $comment= $self.closest('.task-fullview').children('.comment');
        var txt = $comment.find('textarea').val();
        var cb = $comment.find('input[name="close"]');

        var opts = $tracker.data('tasktracker_options') || {};
        var payload = {
          id: $task.data('id'),
          comment: txt
        };
        $.extend(payload, _.pick(opts, 'form', 'tasktemplate', 'templatefile'));
        var close = cb.attr('checked');
        if ( close ) {
          payload.Status = 'closed';
        }

        $.blockUI();
        $.taskapi.update(payload).fail(error).done(function(response) {
          var expanded = $task.is('.expanded');
          var $newTask = $(createTaskElement(response.data));
          $task.replaceWith( $newTask );

          if (expanded) {
            $newTask.next().remove();
            var $expander = $newTask.children('.expander');
            toggleTaskExpand.call($expander);
          }

          $tracker.panel.replace.call(self, $newTask);
          if ( close ) {
            $('.tasks-btn-next:visible').trigger('click');
          }
        }).always($.unblockUI);

        return false;
      };

      var toggleUpload = function(evt) {
        var $self = $(this);
        var $upload = $self.closest('.task-fullview').children('.upload');
        $upload.toggleClass('active');
        return false;
      };

      var toggleComment = function(evt) {
        var $self = $(this);
        var $comment = $self.closest('.task-fullview').children('.comment');
        var $upload = $self.closest('.task-fullview').children('.upload');
        if ( $upload.is('.active') ) {
          $upload.removeClass('active');
        }

        $comment.toggleClass('active');

        var $actions = $self.closest('.actions');
        var $a = $actions.children('.active');
        var $h = $actions.children('.hidden');

        $a.toggleClass('active').toggleClass('hidden');
        $h.toggleClass('active').toggleClass('hidden');

        if ( evt.data === true ) {
          $comment.find('input[name="close"]').prop('checked', true);
        }

        return false;
      };

      var editViewer = function(evt) {
        $('#task-panel').children('.close').click();
        hoveredTask = $task;
        editClicked();
        return false;
      };

      var uploadFinished = function() {
        var $dnd = $(this);
        var web = $dnd.data('web');
        var topic = $dnd.data('topic');
        var id = web + '.' + topic;

        $.taskapi.get({query: {id: id}}).done(function(result) {
          if ( result.status !== 'ok' || result.data.length === 0 ) {
            return;
          }

          var $html = $(result.data[0].html);
          var $viewer = $html.children('.task-fullview-container').find('.viewer').detach();
          $viewer.find('.tasks-btn-edit').on('click', editViewer);
          $dnd.closest('.task-fullview').children('.viewer').replaceWith($viewer);

          if ( window.foswiki.ModacContextMenuPlugin ) {
            var $table = $viewer.find('div.foswikiAttachments > table');
            var tds = $table.find('td.foswikiTableCol1');
            $.each(tds, function(i, e) {
                foswiki.ModacContextMenuPlugin.attachContextMenu(e);
            });
          }
        });
      };

      var nextTask = function() {
        hoveredTask = getTaskSibling.call($task, 'next');
        $tracker.panel.replace.call(self, hoveredTask);
        return false;
      };

      var prevTask = function() {
        hoveredTask = getTaskSibling.call($task, 'prev');
        $tracker.panel.replace.call(self, hoveredTask);
        return false;
      };

      var cancelComment = function() {
        var $self = $(this);

        var $actions = $self.closest('.actions');
        var $a = $actions.children('.active');
        var $h = $actions.children('.hidden');
        $a.toggleClass('active').toggleClass('hidden');
        $h.toggleClass('active').toggleClass('hidden');

        var $comment = $actions.parent().children('.comment');
        $comment.find('textarea').val('');
        $comment.find('input[name="close"]').prop('checked', false);
        $comment.toggleClass('active');

        return false;
      };

      this.find('.tasks-btn-next')
        .off('click', nextTask)
        .on('click', nextTask);
      this.find('.tasks-btn-prev')
        .off('click', prevTask)
        .on('click', prevTask);
      this.find('.tasks-btn-comment')
        .off('click', toggleComment)
        .on('click', toggleComment);
      this.find('.tasks-btn-upload')
        .off('click', toggleUpload)
        .on('click', toggleUpload);
      this.find('.qw-dnd-upload')
        .off('queueEmpty', uploadFinished)
        .on('queueEmpty', uploadFinished);
      this.find('.tasks-btn-edit')
        .off('click', editViewer)
        .on('click', editViewer);
      this.find('.tasks-btn-close')
        .off('click', toggleComment)
        .on('click', true, toggleComment);
      this.find('.tasks-btn-save-comment')
        .off('click', saveComment)
        .on('click', saveComment);
      this.find('.tasks-btn-cancel-comment')
        .off('click', cancelComment)
        .on('click', cancelComment);
    };

    var hideFunc = function() {
      this.find('.tasks-btn-save-comment').off('click');
      this.find('.tasks-btn-cancel-comment').off('click');
      this.find('.tasks-btn-edit').off('click');
      this.find('.tasks-btn-next').off('click');
      this.find('.tasks-btn-close').off('click');
      this.find('.tasks-btn-prev').off('click');
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
    // hoveredTask = undefined;
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
    var $task = hoveredTask;
    if ( closeTaskEx() ) {
      return false;
    }

    $task.removeClass('highlight');
    return false;
  };

  var closeTaskEx = function() {
    hoveredTask.addClass('highlight');

    var $task = hoveredTask;
    var $next = $task.next();

    var $tracker = hoveredTask.closest('.tasktracker');
    var opts = $tracker.data('tasktracker_options');

    var confirmed = confirm(decodeURIComponent(opts.lang.closeTask));
    if ( confirmed ) {
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
    }

    return confirmed;
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
    // detach all handlers first
    // moved here due to performance reasons
    // (mutation observer's 'removed listener' is pretty slow)
    detachEventHandler();

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

  // due to performance reasons, stop any mutation observers
  var onSortStart = function() {
    $('.tasktracker').disconnect();
  };

  // (re)attach mutation observers
  var onSortEnd = function() {
    $('.tasktracker').observe('added', 'tr.task', function(record) {
      attachEventHandler();
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

    attachEventHandler();
    applyLevels();
  });
}(jQuery, window._, window.document, window));
