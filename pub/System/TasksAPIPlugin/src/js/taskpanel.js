TasksPanel = function(tasktracker) {
  var self = this;
  var listeners = {};

  this.on = function(name, callback) {
    if ( typeof callback !== 'function' ) {
      return;
    }

    if ( !listeners[name] ) {
      listeners[name] = [];
    }

    listeners[name].push(callback);
  };

  this.trigger = function() {
    var args = [].splice.call(arguments, 0);
    var evt = args[0];
    if ( listeners[evt.type] ) {
      for ( var i = 0; i < listeners[evt.type].length; ++i ) {
        if ( listeners[evt.type][i].apply(this, args) === false ) {
          evt.preventDefault();
        }

        if ( evt.isImmediatePropagationStopped() ) {
          return;
        }
      }
    }
  };

  var isCtrlKeyDown = false;
  var isControlsHovered = false;

  this.currentTask = null;
  this.tracker = tasktracker;
  this.overlay = this.tracker.find('> .overlay > .task-overlay');

  this.comment = this.overlay.find('> .panel-wrapper > .textarea');
  this.panel = this.overlay.find('> .panel-wrapper > .panel');
  this.upload = this.overlay.find('> .panel-wrapper > .upload');

  this.buttons = {
    add: this.overlay.find('> .panel-wrapper > .buttons > .view .add'),
    cancel: this.overlay.find('> .panel-wrapper > .buttons > .edit .cancel'),
    close: this.overlay.find('> .panel-wrapper > .close'),
    comment: this.overlay.find('> .panel-wrapper > .buttons > .view .comment'),
    edit: this.overlay.find('> .panel-wrapper > .buttons > .view .edit'),
    next: this.overlay.find('> .panel-wrapper > .buttons > .view .next'),
    previous: this.overlay.find('> .panel-wrapper > .buttons > .view .previous'),
    save: this.overlay.find('> .panel-wrapper > .buttons > .edit .save'),
    upload: this.overlay.find('> .panel-wrapper > .buttons > .view .upload'),
  };

  var detachHandler = function() {
    self.buttons.add.off('click');
    self.buttons.cancel.off('click');
    self.buttons.close.off('click');
    self.buttons.comment.off('click');
    self.buttons.edit.off('click');
    self.buttons.next.off('click');
    self.buttons.previous.off('click');
    self.buttons.save.off('click');
    self.buttons.upload.off('click');
    self.overlay.off('click');
    self.overlay.off('queueEmpty');

    self.panel.off('keydown', 'input[name="Title"]');
    self.panel.off('blur', 'input[name="Title"]');
    self.overlay.off('keydown', 'input, textarea, [contenteditable], div[name="comment"]');
    self.panel.off('keydown', 'input');
    self.panel.off('click', '.caption > .controls');
    self.panel.off('click', '.task-changeset-add, .task-changeset-edit');
    self.panel.off('click', '.task-changeset-remove');
    self.panel.off('click', '.jqTabGroup > li > a');
    self.panel.off('click', '.task-details .description > article a');
    self.panel.off('click', '.task-attachments tbody tr');
    self.panel.off('click', '.more-changes');
    self.panel.off('keydown', '.task-changeset-comment');
    self.panel.off('mouseenter', '.controls');
    self.panel.off('mouseleave', '.controls');

    window.onkeydown = window.onkeyup = null;
  };

  var attachHandler = function() {
    detachHandler();

    window.onkeydown = window.onkeyup = function(e) {
      isCtrlKeyDown = e.ctrlKey;

      if ( !isControlsHovered ) {
        self.panel.find('.controls i').each(function() {
          var $i = $(this);
          $i.removeClass('fa-trash-o');
          $i.addClass($i.hasClass('closed') ? 'fa-check-square' : 'fa-square-o');
        });

        return;
      }

      self.panel.find('.controls i').each(function() {
        var $i = $(this);
        if ( isCtrlKeyDown ) {
          $i.removeClass('fa-square-o fa-check-square fa-check-square-o').addClass('fa-trash-o');
        } else {
          $i.removeClass('fa-trash-o');
          $i.addClass($i.hasClass('closed') ? 'fa-square-o' : 'fa-check-square-o');
        }
      });
    };

    self.buttons.cancel.on('click', onCancel);
    self.buttons.close.on('click', onClose);
    self.buttons.comment.on('click', onComment);
    self.buttons.edit.on('click', onEdit);
    self.buttons.next.on('click', onNextTask);
    self.buttons.previous.on('click', onPrevTask);
    self.buttons.save.on('click', onSave);
    self.buttons.upload.on('click', toggleUpload);

    self.buttons.add.on('click', function() {
      self.currentTask.removeClass('highlight');

      if ( self.isUpload ) {
        toggleUpload();
      }

      self.createTask();
      return false;
    });

    // delay overlay click handler to prevent closing the panel if the user clicked twice on a task element.
    setTimeout(function() {
      self.overlay.on('click', function(evt) {
        if ( self.isEdit || self.isChangesetEdit || self.isComment || self.isUpload ) {
          return;
        }

        var $target = $(evt.target || evt. delegateTarget || evt.toElement);
        if ( $target.hasClass('task-overlay') ) {
          self.close();
        }
      });
    }, 200);

    // handle attachments: open/delete
    self.panel.on('click', '.task-attachments tbody tr', function(evt) {
      var $target = $(evt.target || evt. delegateTarget || evt.toElement);
      if ( $target.is('a.hidden') ) {
        return false;
      }

      var $row = $(this);
      var isDelete = 0;
      if ($target.is('.delete-attachment') || $target.parent().is('.delete-attachment')) {
        isDelete = 1;
      }

      var id = self.currentTask.data('id');
      var file = $(this).find('a.hidden').attr('href');
      var p = foswiki.preferences;
      var endpoint = isDelete ? 'delete' : 'download';
      var url = [
        p.SCRIPTURL,
        '/rest',
        p.SCRIPTSUFFIX,
        '/TasksAPIPlugin/',
        endpoint
      ].join('');

      if (!isDelete) {
        url += '?id=' + self.currentTask.data('id') + '&file=' + file;
        window.open && window.open(url, '_blank');
        return false;
      }

      swal({
        title: jsi18n.get('tasksapi', 'Are you sure?'),
        text: jsi18n.get('tasksapi', 'Do you want to remove this attachment?'),
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6CCE86',
        cancelButtonColor: '#BDBDBD',
        confirmButtonText: jsi18n.get('tasksapi', 'Yes'),
        cancelButtonText: jsi18n.get('tasksapi', 'No'),
        closeOnConfirm: false
      }, function(confirmed) {
        if (confirmed) {
          window.tasksapi.blockUI();
          $.ajax({
            url: url,
            method: 'POST',
            data: {
              id: self.currentTask.data('id'),
              file: file
            },
            success: function() {
              $row.remove();

              var payload = {
                id: self.currentTask.data('id')
              };

              var opts = self.tracker.data('tasktracker_options');
              for (var prop in opts) {
                if ( /template|form|depth|flavor/.test(prop) ) {
                  payload[prop] = opts[prop];
                }
              }

              $.taskapi
                .update(payload)
                .always(window.tasksapi.unblockUI)
                .fail(error)
                .done(function(response) {
                  if (response.status === 'ok' && response.data) {
                    var afterSave = $.Event('afterSave');
                    self.tracker.trigger(afterSave, response.data);

                    // switch to 'attachments tab'
                    // delay to respect task animations
                    setTimeout(function() {
                      var $tabs = self.panel.find('.jqTabGroup > li');
                      if ( $tabs.length > 1 ) {
                        $tabs.last().children('a').trigger('click');
                      }
                    }, 100);
                  }
                });

            },
            error: function(xhr, status, err) {
              window.tasksapi.unblockUI();
              error(xhr, status, err);
            }
          });
        }

        return confirmed;
      });

      return false;
    });

    // limit the length of a task title
    var restrictTitle = function() {
      var $in = $(this);
      var opts = self.tracker.data('tasktracker_options');
      var max = opts.titlelength;
      if (max === 0) {
        return;
      } else if (typeof max !== typeof 0 || max < 0) {
        max = 100;
      }

      var val = $in.val();
      if (val.length > max) {
        $in.val(val.substr(0, max));
        $in.css('background-color', '#f00');
        setTimeout(function() {
          $in.css('background-color', '');
        }, 100);
      }
    };

    self.panel.on('keydown', 'input[name="Title"]', restrictTitle);
    self.panel.on('blur', 'input[name="Title"]', restrictTitle);

    // hocus pocus demanded by sweetalert2
    // else it will fail removing its dynamically created style tag
    self.overlay.on('keydown', 'input, textarea, [contenteditable], div[name="comment"]', function(evt) {
      evt.stopPropagation();
      evt.stopImmediatePropagation();
    });

    self.panel.on('keydown', '.task-changeset-comment', function(evt) {
      // ESC
      if ( evt.keyCode === 27 || evt.which === 27 ) {
        onCancel();
        return false;
      }

      if ( !evt.ctrlKey ) {
        return;
      }

      // CTRL+S
      if ( evt.keyCode === 83 || evt.which === 83 ) {
        onSave();
        return false;
      }
    });

    // Fix jqTabs click handler
    self.panel.on('click', '.jqTabGroup > li > a', function() {
      var newId = $(this).attr('data');
      var $pane = $(this).closest('.jqTabPaneInitialized');
      var oldId = $pane.find('li.current > a').attr('data');
      var opts = $pane.metadata();
      opts.currentTabId = oldId;

      $.tabpane.switchTab($pane, opts, newId);
      return false;
    });

    self.panel.on('click', '.more-changes', function() {
      var $link = $(this);
      $link.parent().children('.task-changeset').fadeIn();
      $link.remove();
      return false;
    });

    // Open links within a task's description always in a new window
    self.panel.on('click', '.task-details .description > article a', function(evt) {
      var $link = $(this);
      if ( $link.attr('href') !== '#' ) {
        window.open($link.attr('href'), '_blank');
        return false;
      }

      evt.preventDefault();
    });

    // add/edit a comment of an existing changeset
    self.panel.on('click', '.task-changeset-add, .task-changeset-edit', function() {
      if ( self.isChangesetEdit ) {
        return;
      }

      var $container = $(this).closest('.task-changeset').find('.task-changeset-comment');
      var $comment = $container.children('.comment');
      $container.data('saved_comment', $comment.html());
      $comment.attr('contenteditable', true);
      $comment.focus();
      self.isChangesetEdit = true;
      setButtons('edit');
      self.panel.find('.task-changeset-add').fadeOut(150);
      self.panel.find('.task-changeset .icons').fadeOut(150);

      return false;
    });

    // handle DnDUpload's queueEmpty event (upload finished)
    self.overlay.on('queueEmpty', function(evt) {
      var payload = {
        id: self.currentTask.data('id')
      };

      var opts = self.tracker.data('tasktracker_options');
      for (var prop in opts) {
        if ( /template|form|depth|flavor/.test(prop) ) {
          payload[prop] = opts[prop];
        }
      }

      window.tasksapi.blockUI();
      $.taskapi
        .update(payload)
        .always(window.tasksapi.unblockUI)
        .fail(error)
        .done(function(response) {
          if ( response.status === 'ok' && response.data ) {
            var fireEvent = function() {
              var afterSave = $.Event( 'afterSave' );
              tasktracker.trigger( afterSave, response.data );
            };

            if (self.isInitialUpload) {
              self.isInitialUpload = false;
              endEdit().done(fireEvent);
            } else {
              toggleUpload();
              fireEvent();
            }
          }
        });
    });

    // remove an existing comment
    // note: this functionality is restricted to self written comments only
    self.panel.on('click', '.task-changeset-remove', function() {
      var $container = $(this).closest('.task-changeset').find('.task-changeset-comment');
      var $comment = $container.children('.comment');

      swal({
        title: jsi18n.get('tasksapi', 'Are you sure?'),
        text: jsi18n.get('tasksapi', 'Do you want to remove this comment?'),
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6CCE86',
        cancelButtonColor: '#BDBDBD',
        confirmButtonText: jsi18n.get('tasksapi', 'Yes'),
        cancelButtonText: jsi18n.get('tasksapi', 'No'),
        closeOnConfirm: false
      }, function(confirmed) {
        if (confirmed) {
          $comment.html('');
          $comment.attr('contenteditable', true);
          self.isChangesetEdit = true;
          onSave();
        }

        return confirmed;
      });

      return false;
    });

    // change the quick action icon (close, reopen, delete)
    self.panel.on('mouseenter', '.controls', function(evt) {
      isControlsHovered = true;
      var $i = $(this).find('i');
      if ( isCtrlKeyDown ) {
        $i.removeClass('fa-check-square fa-square-o').addClass('fa-trash-o');
      } else {
        if ( $i.hasClass('closed') ) {
          $i.removeClass('fa-check-square').addClass('fa-square-o');
        } else {
          $i.removeClass('fa-square-o').addClass('fa-check-square-o');
        }
      }
    });

    // change the quick action icon (close, reopen, delete)
    self.panel.on('mouseleave', '.controls', function() {
      isControlsHovered = false;
      var $i = $(this).find('i');
      if ( $i.hasClass('closed') ) {
        $i.removeClass('fa-square-o fa-trash-o').addClass('fa-check-square');
      } else {
        $i.removeClass('fa-check-square-o fa-trash-o').addClass('fa-square-o');
      }
    });

    // handle quick actions (close, reopen, delete)
    self.panel.on('click', '.caption > .controls', function() {
      var isDelete = $(this).find('i').hasClass('fa-trash-o');
      var data = self.currentTask.data('task_data');
      var isOpen = data.fields.Status.value === 'open';
      var deferred = $.Deferred();
      var payload = {
        id: self.currentTask.data('id'),
      };

      var opts = self.tracker.data('tasktracker_options');
      for (var prop in opts) {
        if ( /template|form|depth|flavor/.test(prop) ) {
          payload[prop] = opts[prop];
        }
      }

      if ( isOpen || isDelete ) {
        var closeTxt = isDelete 
          ? jsi18n.get('tasksapi', 'Do you want to delete this entry?')
          : jsi18n.get('tasksapi', 'Do you want to close this entry?');
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
          type: isDelete ? 'error' : 'warning',
          showCancelButton: true,
          confirmButtonColor: '#6CCE86',
          cancelButtonColor: '#BDBDBD',
          confirmButtonText: jsi18n.get('tasksapi', 'Yes'),
          cancelButtonText: jsi18n.get('tasksapi', 'No'),
          closeOnConfirm: false
        }, function(confirmed) {
          if (confirmed) {
            payload.Status = isDelete ? 'deleted' : 'closed';

            var $dialog = $('.sweet-alert.show-sweet-alert.visible');
            var comment = $dialog.find('div[name="comment"]').html();
            if ( !/^[\s\n\r]*$/.test(comment) && !/^\s*<br\s*\/?>\s*$/.test(comment)) {
              payload.comment = comment;
            }

            deferred.resolve(payload);
          } else {
            deferred.reject();
          }

          return confirmed;
        });
      } else {
        payload.Status = 'open';
        deferred.resolve(payload);
      }

      deferred.promise().done(function(data) {
        // Hotfix. (ToDo)
        data._depth = data.depth ? data.depth : 0;

        window.tasksapi.blockUI();
        $.taskapi.update(data)
          .fail(error)
          .always(window.tasksapi.unblockUI)
          .done(function(response) {
            var $current = self.panel.children('.content.slide-in');
            $current.removeClass('slide-in').addClass('slide-out');
            setTimeout(function() {
              $current.remove();
            }, 500);

            var afterSave = $.Event( 'afterSave' );
            tasktracker.trigger( afterSave, response.data );
          });
      });

      return false;
    });
  };

  // sets the buttons bar at the bottom of a panel
  var setButtons = function(name) {
    if ( !/^(edit|view)$/.test(name) ) {
      return;
    }

    var $btns = self.overlay.find('> .panel-wrapper > .buttons');
    $btns.children().each(function() {
      $(this).removeClass('active');
    });
    $btns.children('.' + name).addClass('active');
  };

  // Checks if the user did any changes within the editor
  var checkDirty = function() {
    var dirty = false;

    if ( self.isEdit ) {
      if ( CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.Description ) {
        for (var instance in CKEDITOR.instances) {
          if (CKEDITOR.instances[instance].checkDirty()){
            dirty = true;
          }
        }
      }
    } else if ( self.isComment ) {
      var $tb = self.comment.children('[contenteditable]');
      dirty = !/^\s*$/.test($tb.html());
    }

    if (!dirty) {
      self.panel.find('input, select').each(function() {
        var $in = $(this);
        if ($in.val() !== $in.data('saved_val')) {
          dirty = true;
        }
      });
    }

    if (!dirty) {
      var txt = self.panel.find('div[name="comment"]').text();
      dirty = !/^[\s\r\n]*$/.test(txt);
    }

    return dirty;
  };

  var cancelHelper = function(closeOverlay) {
    self.isEdit = false;
    self.isView = true;
    self.isCreate = false;

    if ( closeOverlay ) {
      self.close();
    }

    self.taskParent = null;
  };

  var endEdit = function(closeOverlay, taskId) {
    var deferred = $.Deferred();

    var create = self.isCreate;
    self.panel.children().fadeOut(250, function() {
      self.panel.empty();

      if (taskId && !self.isCreate) {
        releaseTopic({id: taskId});
      }

      if (!closeOverlay && !_.isNull(self.currentTask) && taskId !== null) {
        self.currentTask.addClass('highlight');
        var $cnt = $('<div class="content slide-in"></div>').css('display', 'none');
        $cnt.appendTo(self.panel);
        var $view = self.currentTask.find('> .task-fullview-container > .task-fullview');
        $cnt.append($view).fadeIn();
      }

      cancelHelper(closeOverlay);
      setButtons('view');
      deferred.resolve();
    });

    return deferred.promise();
  };

  var handleSaveTask = function() {
    var task = readEditor(self.panel);
    task.id = self.isCreate ? null : self.currentTask.data('task_data').id;

    if ( task.hasError ) {
      swal({
        title: jsi18n.get('tasksapi', 'Attention!'),
        text: jsi18n.get('tasksapi', "You have not filled out the mandatory form field '[_1]'.", task.missingFields),
        type: 'error',
        confirmButtonColor: '#6CCE86',
        showCancelButton: false,
        confirmButtonText: jsi18n.get('tasksapi', 'OK'),
        closeOnConfirm: true
      });

      return false;
    }

    var opts = self.tracker.data('tasktracker_options');
    for (var prop in opts) {
      if ( /template|form|depth|flavor/.test(prop) ) {
        task[prop] = opts[prop];
      }
    }

    task._depth = opts.depth > 0 ? opts.depth : 0;
    var apiFunc = 'update';

    if ( self.isCreate ) {
      apiFunc = 'create';
      task.Context = opts.context;
      task.Parent = self.taskParent;
      if ( !task.Status ) {
        task.Status = 'open';
      }
    }

    if ( opts.mapping && opts.mapping.field ) {
      var field = task[opts.mapping.field];
      var keys = _.without(_.keys(opts.mapping.mappings), 'all');
      task.Status = _.find(keys, function(key) {
        if (!_.isUndefined(key)) {
          if (_.indexOf(opts.mapping.mappings[key], field) > -1) {
            return key;
          }
        }

        return undefined;
      });
    }

    // remove invalid parent entries.
    if ( task.Parent && !/^[^\.]+\.Task-\w+$/.test(task.Parent) ) {
      delete task.Parent;
    }

    var beforeSave = $.Event( 'beforeSave' );
    tasktracker.trigger( beforeSave, task );
    if( beforeSave.isDefaultPrevented() ) {
      return false;
    }

    window.tasksapi.blockUI();
    $.taskapi[apiFunc]( task )
      .always( window.tasksapi.unblockUI )
      .fail( error )
      .done( function( response ) {
        var afterSaveFunc = function(data, suppressEvent) {
          var taskId = self.isCreate ? null : data.id;
          endEdit(false, taskId).done(function() {
            if (!suppressEvent) {
              var afterSave = $.Event('afterSave');
              tasktracker.trigger( afterSave, data );
            }
          });
        };

        if ( self.isCreate ) {
          task.id = response.id;

          var $dnd = self.panel.find('.qw-dnd-upload');
          if (!$dnd.isEmpty()) {
            var arr = task.id.split('.');
            if ( arr.length === 2 ) {
              $dnd.attr('data-web', arr[0]);
              $dnd.attr('data-topic', arr[1]);
              $dnd.data('tasksgrid', 1);
              self.isInitialUpload = true;

              // "pseudo update" current task;
              // required to correctly update the current task after DnD has
              // finished uploading...
              self.currentTask = $(response.data.html);
              self.currentTask.data('id', response.data.id);
              $dnd.upload();
              return;
            }
          }
        }

        afterSaveFunc(response.data);
      });

    return false;
  };

  var handleSaveComment = function() {
    var $cb = self.comment.find('input[name="close"]');
    var $cmt = self.comment.children('div[contenteditable]');
    var comment = $cmt.html();
    if (/^\s*<br\s*\/?>\s*$/.test(comment)) {
      comment = '';
    }

    var payload = {
      id: self.currentTask.data('id'),
      comment: comment
    };

    var opts = self.tracker.data('tasktracker_options') || {};
    for (var prop in opts) {
      if ( /template|form|depth|flavor/.test(prop) ) {
        payload[prop] = opts[prop];
      }
    }

    var close = $cb.attr('checked');
    if ( close ) {
      payload.Status = 'closed';
    }

    window.tasksapi.blockUI();
    $.taskapi.update(payload).fail(error).done(function(response) {
      var afterSave = $.Event( 'afterSave' );
      tasktracker.trigger( afterSave, response.data );

      // clear comment container
      $cmt.empty();

      // cancel/exit "comment composer"
      onCancel();
    }).always(window.tasksapi.unblockUI);

    return false;
  };

  var handleSaveChangeset = function() {
    var $set = self.panel.find('[contenteditable="true"]');
    var $container = $set.parent();
    $container.data('saved_comment', '');

    var cmt = $set.html() || '';
    if (/^\s*<br\s*\/?>\s*$/.test(cmt)) {
      cmt = '';
    }

    var payload = {
      id: self.currentTask.data('id'),
      cid: $container.data('id'),
      comment: cmt
    };

    var opts = self.tracker.data('tasktracker_options') || {};
    for (var prop in opts) {
      if ( /template|form|depth|flavor/.test(prop) ) {
        payload[prop] = opts[prop];
      }
    }

    window.tasksapi.blockUI();
    $.taskapi.update(payload).fail(error).always(window.tasksapi.unblockUI).done(function(response) {
      var afterSave = $.Event( 'afterSave' );
      tasktracker.trigger( afterSave, response.data );
      onCancel();
    });
  };

  var onSave = function() {
    if ( self.isEdit ) {
      handleSaveTask();
    } else if ( self.isComment ) {
      handleSaveComment();
    } else if ( self.isChangesetEdit ) {
      handleSaveChangeset();
    }

    return false;
  };

  var onCancel = function() {
    if (self.isEdit) {
      var closeOverlay = self.isCreate && _.isNull(self.currentTask);
      var taskId = self.currentTask ? self.currentTask.data('id') : null;

      if (checkDirty()) {
        swal({
          title: jsi18n.get('tasksapi', 'Are you sure?'),
          text: jsi18n.get('tasksapi', 'Your previous changes will be lost.'),
          type: 'error',
          showCancelButton: true,
          confirmButtonColor: '#6CCE86',
          cancelButtonColor: '#BDBDBD',
          confirmButtonText: jsi18n.get('tasksapi', 'Yes'),
          cancelButtonText: jsi18n.get('tasksapi', 'No'),
          closeOnConfirm: true
        }, function(confirmed) {
          if (confirmed) {
            endEdit(closeOverlay, taskId);
          }
        });
      } else {
        endEdit(closeOverlay, taskId);
      }

      return false;
    }

    if (self.isComment) {
      self.comment.children('div[contenteditable]').empty();
      self.isComment = false;
      setButtons('view');
      self.comment.removeClass('active');
    }

    if ( self.isChangesetEdit ) {
      var $comment = self.panel.find('[contenteditable="true"]');
      var $container = $comment.parent();

      $comment.html($container.data('saved_comment'));
      $container.data('saved_comment', '');
      $comment.removeAttr('contenteditable');
      setButtons('view');
      self.isChangesetEdit = false;
      self.panel.find('.task-changeset-add').fadeIn(150);
      self.panel.find('.task-changeset .icons').fadeIn(150);
    }

    return false;
  };

  var onClose = function() {
    if ( self.isEdit || self.isCreate || self.isComment ) {
      self.buttons.cancel.triggerHandler('click', {close: true});
    } else {
      self.close();
    }

    return false;
  };

  var onComment = function() {
    self.isComment = true;

    if ( self.isUpload ) {
      toggleUpload();
    }

    setButtons('edit');
    self.comment.addClass('active');
    return false;
  };

  var onEdit = function() {
    if ( self.isUpload ) {
      toggleUpload();
    }

    var task = self.isCreate ? null : self.currentTask.data('task_data');
    var opts = {};
    var topts = self.tracker.data('tasktracker_options');
    for(var p in topts ) {
      if ( /string|number|boolean/.test( typeof topts[p] ) ) {
        opts[p] = topts[p];
      }
    }

    opts.id = self.isCreate ? '' : task.id;
    opts.trackerId = self.tracker.attr('id');
    opts.autoassign = topts.autoassign;
    opts._depth = self.isCreate ? topts.depth : task.depth;

    if ( self.taskParent ) {
      opts.parent = self.taskParent;
    }

    if ( self.isCreate ) {
      var beforeCreate = $.Event( 'beforeCreate' );
      tasktracker.trigger( beforeCreate, opts );
      if( beforeCreate.isDefaultPrevented() ) {
        return false;
      }
    }

    window.tasksapi.blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      self.isEdit = true;
      self.isView = false;
      setButtons('edit');

      var $ed = $(response.editor);
      if ( !self.isCreate ) {
        // fill the editor
        // (missing data or at least reformat it; e.g. epoch to time string conversion)
        writeEditor($ed, task);
      }

      if ( topts.autoassign && topts.autoassignTarget ) {
        var $type = $ed.find('select[name="Type"]');
        var $target = $ed.find('input[name="' + topts.autoassignTarget + '"]');
        var isSelect2 = false;
        if ($target.length === 0) {
          $target = $ed.find('select[name="' + topts.autoassignTarget + '"]');
          isSelect2 = $target.length > 0;
        }

        var autoassign = topts.autoassign.split(',');
        var assign = {};
        var assignees = [];
        _.each( topts.autoassign.split(','), function(a) {
          var arr = a.split('=');
          assign[arr[0]] = arr[1];
          assignees.push(arr[1]);
        });

        var setAssignee = function() {
          var $self = $(this);
          var val = $self.val();
          var assignTo = assign[val];
          if ( assignTo ) {
            $target.closest('.' + topts.autoassignTarget).css('display', 'none');
            if (isSelect2) {
              if ($target.children().length === 0) {
                $target.append('<option selected="selected"></option>');
              }

              var $o = $target.children('option[selected],option:selected');
              $o.val(assignTo).text(assignTo);
              $target.next().find('.select2-selection__rendered').text(assignTo).attr('title', assignTo);
            } else {
              setTimeout(function() {
                $target.trigger('Clear');
                $target.trigger('AddValue', assignTo);
              }, 100);
            }
          } else {
            $target.closest('.' + topts.autoassignTarget).css('display', 'block');
            var tval = $target.val();
            if ( assignees.indexOf(val) === -1 && assignees.indexOf(tval) === -1 ) {
              if (isSelect2) {
                $target.children('option[selected],option:selected').remove();
                $target.next().find('.select2-selection__rendered').text('').attr('title', '');
              } else {
                $target.trigger('Clear');
              }
            } else if (isSelect2) {
              $target.children('option[selected],option:selected').remove();
              $target.next().find('.select2-selection__rendered').text('').attr('title', '');
            }
          }
        };

        $type.on('change', setAssignee);
      }

      // select the task details tab if it's not selected already
      var $tabs = self.panel.find('.jqTabGroup > li');
      if ( $tabs.length > 1 ) {
        $tabs.first().children('a').trigger('click');
      }

      var $full = self.panel.find('> .content > .task-fullview');
      if ($full.length) {
        $full.detach().appendTo(self.currentTask.children('.task-fullview-container'));
        self.panel.empty();
      }

      var $content = $('<div class="content slide-in"></div>');
      $content.css('display', 'none');
      if ( self.isCreate ) {
        toggleOverlay(true);
        $content.append($ed).appendTo(self.panel);
      } else {
        var $clone = $full.clone();
        self.panel.empty();

        var $cnt = $clone.find('.task-details:not(.attachments)').parent();
        $cnt.empty().append($ed);
        $content.append($clone).appendTo(self.panel);
      }

      // show the editor; delay execution for smoother animation
      setTimeout(function() {
        $content.fadeIn();

        // save state for possible dirty checks
        $ed.find('input, select').each(function() {
          $(this).data('saved_val', $(this).val());
        });
      }, 100);


      // Fixes MA #10193
      $ed.find('select.foswikiSelect2Field option').each(function() {
        if (this.attributes && this.attributes.selected) {
          if (this.attributes.selected.value === 'selected') {
            this.selected = true;
          }
        }
      });
    }).fail( error ).always( window.tasksapi.unblockUI );

    return false;
  };

  var writeEditor = function(editor, task) {
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

      var $input = editor.find(sel);
      if ( $input.hasClass('foswikiEditFormDateField') ) {
        if ( /^\d+$/.test(field.value) || /^\d+\s\w+\s\d+$/.test(field.value) ) {
          var d;
          if ( /^\d+\s\w+\s\d+$/.test(field.value) ) {
            d = new Date(field.value);
          } else {
            d = new Date();
            d.setTime(parseInt(field.value + '000'));
          }

          $input.val(d.print('%e %b %Y'));
        }
      } else {
        $input.val(field.value);
      }
    });

    if ( CKEDITOR && CKEDITOR.instances ) {
      for (var instance in CKEDITOR.instances) {
        CKEDITOR.instances[instance].resetDirty();
      }
    }
  };

  var readEditor = function(editor) {
    var data = {
      hasError: false
    };

    var missingFields = [];
    editor.find('input[name],select[name],textarea[name]').each(function() {
      var $input = $(this);
      var prop = $input.attr('name');
      if (!prop || /^\s*$/.test(prop)) {
        return;
      }
      var val = $input.val();
      if (!val && $input.hasClass('foswikiSelect2Field') && $input.is('select')) {
        var $selected = $input.children('option[selected]');
        if (!$selected.length || ($selected.length === 1 && !$selected.val())) {
          $selected = $input.children('option:selected')
        }

        if ($selected.length > 1) {
          val = [];
          $selected.each(function() {
            val.push($(this).val());
          });
        } else {
          val = $selected.val();
        }
      }

      if ( _.isArray(val) ) {
        val = val.join(', ');
      }


      if ( $input.hasClass('foswikiEditFormDateField') ) {
        try {
          if (val) {
            var d = new Date(val);
            val = d.print('%s');
          }
        } catch(e) {
          error(e);
        }
      }

      if ( /^$/.test(val) ) {
        val = $input.attr('value');
      }

      if ( $input.hasClass('foswikiMandatory') && (/^\s*$/.test( val ) || val === null || val === undefined ) ) {
        var fname = $input.parent().find('span').text().replace(/\*/g, '');
        if ( !fname ) {
          fname = jsi18n.get('tasksapi', prop) || prop;
        }
        missingFields.push(fname);
        data.hasError = true;
        return false;
      }

      data[prop] = val !== null ? val : "";
    });

    if ( data.hasError ) {
      data.missingFields = missingFields;
    }

    var $cmt = editor.find('div[name="comment"]');
    if ($cmt.length) {
      var cmt = $cmt.html();
      if (/^\s*<br\s*\/?>\s*$/.test(cmt)) {
        cmt = '';
      }

      data.comment = cmt;
    }

    return data;
  };

  var onNextTask = function() {
    var task = self.next();
    return false;
  };

  var onPrevTask = function() {
    var task = self.prev();
    return false;
  };

  var toggleUpload = function() {
    self.isUpload = !self.isUpload;
    self.upload.toggleClass('active');
    if ( self.upload.hasClass('active') ) {
      var id = self.currentTask.data('id');
      var arr =id.split('.');
      if ( arr.length === 2 ) {
        var $dnd = self.upload.find('.qw-dnd-upload');
        $dnd.attr('data-web', arr[0]);
        $dnd.attr('data-topic', arr[1]);
        $dnd.data('tasksgrid', 1);
      }
    }
    return false;
  };

  var error = function() {
    if ( window.console && console.error ) {
      console.error.apply(console, arguments);
    }

    swal({
      type: 'error',
      title: jsi18n.get('tasksapi', 'Oops'),
      text: jsi18n.get('tasksapi', 'Something went wrong! Try again later.'),
      timer: 1500,
      showConfirmButton: true,
      showCancelButton: false
    });
  };

  var isTask = function($task) {
    return $task && $task.hasClass('task');
  };

  var getSibling = function($task, direction) {
    if ( !isTask($task) ) {
      return;
    }

    var sel, func;
    if ( /^prev$/i.test(direction) ) {
      sel = 'last';
      func = 'prev';
    } else {
      sel = 'first';
      func = 'next';
    }

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
  var initReadMoreInformees = function($content){
		$content = $content || $(document);
		var href = $content.find('.task-informee');

		/*
		* destroy does not work, cause the readmore element does not exists
		* It does not exist because attach and detach from task
		*
        * href.readmore('destroy');
		*/
		href.attr({'data-readmore': null,'aria-expanded': null})
			.css({maxHeight: '',height: ''})
			.next('[data-readmore-toggle]')
			.remove();
		
		href.readmore({
			collapsedHeight: 0,
			speed: 400,
			lessLink: '<a class="readmore_link" href="#">' + jsi18n.get("tasksapi", "Show less") + "</a>",
			moreLink: '<a class="readmore_link" href="#">' + jsi18n.get("tasksapi", "Show more") + "</a>"
		});
  }
  var initReadmore = function($content) {
    $content = $content || self.panel.find('.content.slide-in');

    var $article = $content.find('.description article');
    $article.readmore('destroy');
    $article.readmore({
      collapsedHeight: 150,
      speed: 400,
      lessLink: '<a class="readmore_link" href="#">' + jsi18n.get('tasksapi', 'Show less') + '</a>',
      moreLink: '<a class="readmore_link" href="#">' + jsi18n.get('tasksapi', 'Show more') + '</a>'
    });
  };

  var isAnimating = false;
  var animateTaskChange = function(direction) {
    if ( isAnimating || !self.currentTask || self.isEdit ) {
      return;
    }

    isAnimating = true;
    var nextTask = getSibling(self.currentTask, direction);
    if ( nextTask[0] === self.currentTask[0] ) {
      isAnimating = false;
      return self.currentTask;
    }

    // scroll highlighted task into view...
    self.currentTask.removeClass('highlight');
    nextTask.addClass('highlight');
    var wh = $(window).height();
    var sy = window.scrollY;
    var ot = nextTask.offset().top;
    var th = nextTask.height();

    if ( sy + wh < ot + th || sy > ot ) {
      $('body,html').animate({
        scrollTop: ot - th
      });
    }

    // close upload panel (if active);
    if ( self.isUpload ) {
      toggleUpload();
    }

    // prepare content switching
    var $content = $('<div class="content"></div>');
    if ( direction === 'prev' ) {
      $content.addClass('slide-out');
    }

    var $nextView = nextTask.find('> .task-fullview-container > .task-fullview');
    $nextView.detach().appendTo($content);
    $content.appendTo(self.panel);

    setTimeout(function() {
      var $current = self.panel.children('.content.slide-in');

      // switch contents
      $content.addClass('slide-in');
      if ( direction === 'prev' ) {
        $content.removeClass('slide-out');
      }

      $current.fadeOut(300, function() {
        $current.off('transitionend').remove();

        var $view = $current.children('.task-fullview').detach();
        $view.appendTo(self.currentTask.children('.task-fullview-container'));
        self.currentTask = nextTask;
        isAnimating = false;

        $current.remove();
      });

      initReadMoreInformees($content);
    }, 25);

    return nextTask;
  };

  var handleLease = function( action, payload ) {
    var deferred = $.Deferred();

    var prefs = foswiki.preferences;
    var url = [
      prefs.SCRIPTURL,
      '/rest',
      prefs.SCRIPTSUFFIX,
      '/TasksAPIPlugin/',
      action
    ].join('');

    $.ajax({
      url: url,
      data: payload,
      success: function( response ) {
        var json = $.parseJSON( response );
        deferred.resolve( json );
      },
      error: function( xhr, sts, err ) {
        deferred.reject( err );
        error(err);
      }
    });

    return deferred.promise();
  };

  var leaseTopic = function( data ) {
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'lease', payload, data.id );
  };

  var releaseTopic = function( data ) {
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'release', payload );
  };

  var loadedScripts = [];
  var loadScript = function( id, script ) {
    if ( loadedScripts.indexOf(id) !== - 1) {
      return;
    }

    loadedScripts.push(id);
    $(script).appendTo( $('head') );
  };

  var updateHead = function( data ) {
    var $head = $('head');
    var html = $head.html();
    _.each( data, function( entry ) {
      var r = new RegExp( entry.id );

      if ( !r.test( html ) ) {
        _.each( entry.requires, function( require ) {
          var rr = new RegExp( require.id );
          if ( !rr.test( html ) ) {
            loadScript( require.id, require.text );
          }
        });

        loadScript( entry.id, entry.text );
        html = $head.html();
      }
    });
  };

  var closeOverlay = function() {
    self.isView = false;
    var $current = self.panel.children('.content.slide-in');
    if ( !self.isCreate && self.currentTask !== null ) {
      var $view = $current.children('.task-fullview').detach();
      $view.appendTo(self.currentTask.children('.task-fullview-container'));
    } else {
      $current.empty();
    }

    if ( self.currentTask !== null ) {
      self.currentTask.removeClass('highlight');
      self.currentTask = null;
    }

    toggleOverlay(false, true);
  };

  var toggleOverlay = function(skipActive, forceClose) {
    if ( skipActive && self.overlay.hasClass('active') ) {
      return;
    }

    var $body = $('body');
    if ( forceClose && self.overlay.hasClass('active') ) {
      $body.css('overflow', '');
      self.overlay.fadeOut(function() {
        self.overlay.removeClass('active');
        self.overlay.children('.panel-wrapper').removeClass('active');
        self.panel.empty();
      });

      return;
    }

    var func = self.overlay.hasClass('active') ? 'fadeOut' : 'fadeIn';
    self.overlay.children('.panel-wrapper').toggleClass('active');
    self.overlay[func].call(self.overlay, function() {
      self.overlay.toggleClass('active');
    });

    if ( func === 'fadeOut' ) {
      $body.css('overflow', '');
    } else {
      $body.css('overflow', 'hidden');
      attachHandler();
      sliceChanges( $('.task-overlay .changes') );
    }
  };

  var sliceChanges = function($container) {
    var $changes = $container.children(".task-changeset");
    if ( $changes.length > 3 && $container.children('.more-changes').length === 0 ) {
      $changes.slice(3).hide();
      var $a = $('<a class="more-changes" href="#">' + jsi18n.get('tasksapi', 'Show more changes') + '</a>');
      $a.insertAfter(".task-overlay .task-changeset:last");
    }
  };

  this.close = function() {
    if ( self.isUpload ) {
      toggleUpload();
    }

    if ( self.isEdit || self.isComment || self.isCreate ) {
      self.buttons.cancel.triggerHandler('click', {close: true});
    } else {
      closeOverlay();
    }
  };

  this.createTask = function(parent) {
    self.isCreate = true;
    if ( parent ) {
      self.taskParent = parent;
    }

    onEdit();
  };

  this.editTask = function($task) {
    if ( !isTask($task) ) {
      return;
    }

    self.isEdit = true;
    self.currentTask = $task;
    toggleOverlay(true);
  };

  this.updateCurrentTask = function(changedFields) {
    if ( typeof changedFields !== typeof {} || _.isUndefined(self.currentTask)) {
      return undefined;
    }

    if ( !self.currentTask || self.currentTask.length === 0 ) {
      return undefined;
    }

    var data = self.currentTask.data('task_data');
    var task = {id: data.id};
    var opts = self.tracker.data('tasktracker_options');
    for (var p in changedFields) {
      task[p] = changedFields[p];
    }

    for (var prop in opts) {
      if ( /template|form|depth|flavor/.test(prop) ) {
        task[prop] = opts[prop];
      }
    }

    task._depth = opts.depth > 0 ? opts.depth : 0;
    var apiFunc = 'update';

    if ( opts.mapping && opts.mapping.field ) {
      var field = task[opts.mapping.field];
      var keys = _.without(_.keys(opts.mapping.mappings), 'all');
      task.Status = _.find(keys, function(key) {
        if (!_.isUndefined(key)) {
          if (_.indexOf(opts.mapping.mappings[key], field) > -1) {
            return key;
          }
        }

        return undefined;
      });
    }

    // remove invalid parent entries.
    if ( task.Parent && !/^[^\.]+\.Task-\w+$/.test(task.Parent) ) {
      delete task.Parent;
    }

    var beforeSave = $.Event( 'beforeSave' );
    tasktracker.trigger( beforeSave, task );
    if( beforeSave.isDefaultPrevented() ) {
      return false;
    }

    window.tasksapi.blockUI();
    $.taskapi[apiFunc]( task )
      .always( window.tasksapi.unblockUI )
      .fail( error )
      .done( function( response ) {
        if ( self.currentTask !== null ) {
          self.currentTask.removeClass('highlight');
        }

        // Prevent re-adding content to DOM (modac #10291)
        self.isEdit = true;
        var afterSave = $.Event( 'afterSave' );
        tasktracker.trigger( afterSave, response.data );
        self.isEdit = false;
      });
  };

  this.viewTask = function($task) {
    if ( !isTask($task) ) {
      return;
    }

    self.isView = true;
    self.currentTask = $task;
    self.currentTask.addClass('highlight');
    self.panel.empty();

    var $content = $('<div class="content slide-in"></div>').css('display', 'none');
    var $view = $task.find('> .task-fullview-container > .task-fullview').detach();
    $content.append($view).appendTo(self.panel);

    toggleOverlay(true);
    setTimeout(function() {
      initReadmore($content);
      initReadMoreInformees($content);
      sliceChanges($content.find('.changes'));
      $content.fadeIn(300);
    }, 100);
  };

  this.next = function() {
    return animateTaskChange('next');
  };

  this.prev = function() {
    return animateTaskChange('prev');
  };

  return this;
};
