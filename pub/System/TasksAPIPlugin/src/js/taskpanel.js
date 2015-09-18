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

  // used to store a reference to the detached .task-details and its parent container
  this.savedStates = {
    details: null,
    parent: null
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

    self.panel.off('keydown', 'input');
    self.panel.off('click', '.caption > .controls');
    self.panel.off('mouseenter', '.controls');
    self.panel.off('mouseleave', '.controls');
    self.panel.off('click', '.task-changeset-add, .task-changeset-edit');
    self.panel.off('click', '.task-changeset-remove');
    self.panel.off('keydown', '.task-changeset-comment');
    self.panel.off('click', '.task-attachments tbody tr');

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

    self.buttons.cancel.on('click', function() {
      onCancel();
      return false;
    });
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

    self.panel.on('click', '.task-attachments tbody tr', function(evt) {
      var $target = $(evt.target || evt. delegateTarget || evt.toElement);
      if ( $target.is('a.hidden') ) {
        return false;
      }

      var id = self.currentTask.data('id');
      var file = $(this).find('a.hidden').attr('href');
      var p = foswiki.preferences;
      var url = [
        p.SCRIPTURL,
        '/rest',
        p.SCRIPTSUFFIX,
        '/TasksAPIPlugin/download?id=',
        self.currentTask.data('id'),
        '&file=',
        file
      ].join('');

      window.open && window.open(url, '_blank');
      return false;
    });

    // hocus pocus demanded by sweetalert2
    // else it will fail removing its dynamically created style tag
    self.panel.on('keydown', 'input', function(evt) {
      evt.stopPropagation();
      evt.stopImmediatePropagation();
    });

    self.panel.on('keydown', '.task-changeset-comment', function(evt) {
      if ( evt.keyCode === 27 || evt.which === 27 ) {
        onCancel();
        return false;
      }

      if ( !evt.ctrlKey ) {
        return;
      }

      if ( evt.keyCode === 83 || evt.which === 83 ) {
        onSave();
        return false;
      }
    });

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

    self.overlay.on('queueEmpty', function() {
      var $dnd = $(this);
      window.tasksapi.blockUI();
      $.taskapi
        .get({query:{id: self.currentTask.data('id')}})
        .always(window.tasksapi.unblockUI)
        .fail(error)
        .done(function(response) {
          if ( response.status === 'ok' && response.data && response.data.length > 0 ) {
            var afterSave = $.Event( 'afterSave' );
            self.trigger( afterSave, response.data[0] );
            onCancel();
            toggleUpload();
          }
        });
    });

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

    self.panel.on('mouseleave', '.controls', function() {
      isControlsHovered = false;
      var $i = $(this).find('i');
      if ( $i.hasClass('closed') ) {
        $i.removeClass('fa-square-o fa-trash-o').addClass('fa-check-square');
      } else {
        $i.removeClass('fa-check-square-o fa-trash-o').addClass('fa-square-o');
      }
    });

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
          '<br><div style="float: left; margin: 12px 0 0 30px;"><small>',
          cmtTxt,
          '</small></div><div style="clear: both"></div><textarea style="width: 400px;" name="Comment" rows="4" cols="50"></textarea><br><br>'
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
            var comment = $dialog.find('textarea[name="Comment"]').val();
            if ( !/^[\s\n\r]*$/.test(comment) ) {
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
            self.trigger( afterSave, response.data );
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

  var checkDirty = function() {
    var dirty = false;

    if ( self.isEdit ) {
      if ( CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.Description ) {
        dirty = CKEDITOR.instances.Description.checkDirty();
      }
    } else if ( self.isComment ) {
      var $tb = self.overlay.find('textarea[name="TaskComment"]');
      dirty = !/^\s*$/.test($tb.val());
    }

    // ToDo. do more checks here

    return dirty;
  };

  var cancelEdit = function(closeOverlay) {
    if ( !self.isCreate ) {
      releaseTopic({ id: self.currentTask.data('id') });
    }

    if ( self.savedStates.details !== null && self.savedStates.parent !== null && self.savedStates.parent.length > 0 ) {
      self.savedStates.parent.fadeOut(200, function() {
        if ( !self.isCreate ) {
          self.savedStates.parent.empty();
        }

        self.savedStates.details.appendTo(self.savedStates.parent);

        // set by a previous call to fadeOut
        self.savedStates.details.attr('style', '');
        self.savedStates.parent.fadeIn(200);
        setTimeout(function() {
          var parent = self.savedStates.parent;
          initReadmore(parent);
          sliceChanges(parent.find('.changes'));
          self.savedStates.details = self.savedStates.parent = null;
        }, 250);
      });
    }

    self.isEdit = false;
    self.isView = true;

    if ( closeOverlay ) {
      self.close();
    }

    self.isCreate = false;
    self.taskParent = null;
    setButtons('view');
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
      task.Context = self.tracker.data('tasktracker_options').context;
      task.Parent = self.taskParent;
      if ( !task.Status ) {
        task.Status = 'open';
      }
    }

    var beforeSave = $.Event( 'beforeSave' );
    self.trigger( beforeSave, task );
    if( beforeSave.isDefaultPrevented() ) {
      self.taskParent = null;
      return false;
    }

    window.tasksapi.blockUI();
    $.taskapi[apiFunc]( task )
      .always( window.tasksapi.unblockUI )
      .fail( error )
      .done( function( response ) {
        if ( self.isCreate ) {
          task.id = response.id;
        }

        var afterSave = $.Event( 'afterSave' );
        self.trigger( afterSave, response.data );
        cancelEdit();
      });

    return false;
  };

  var handleSaveComment = function() {
    var $textarea = self.overlay.find('textarea[name="TaskComment"]');
    var $cb = $textarea.parent().find('input[name="close"]');
    var comment = $textarea.val();

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
      self.trigger( afterSave, response.data );

      // cancel/exit "comment composer"
      onCancel();
    }).always(window.tasksapi.unblockUI);

    return false;
  };

  var handleSaveChangeset = function() {
    var $set = self.panel.find('[contenteditable="true"]');
    var $container = $set.parent();
    $container.data('saved_comment', '');

    var payload = {
      id: self.currentTask.data('id'),
      cid: $container.data('id'),
      comment: $set.html() || ''
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
      self.trigger( afterSave, response.data );
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
    var deferred = $.Deferred();

    if ( self.isEdit ) {
      if ( checkDirty() ) {
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
          if ( confirmed ) {
            cancelEdit(self.isCreate);
            deferred.resolve();
          } else {
            deferred.reject();
          }
        });
      } else {
        cancelEdit();
        deferred.resolve();
      }
    } else if ( self.isComment ) {
      self.overlay.find('textarea[name="TaskComment"]').val('');
      self.isComment = false;
      setButtons('view');
      self.comment.removeClass('active');
      deferred.resolve();
    } else if ( self.isChangesetEdit ) {
      var $comment = self.panel.find('[contenteditable="true"]');
      var $container = $comment.parent();

      $comment.html($container.data('saved_comment'));
      $container.data('saved_comment', '');
      $comment.removeAttr('contenteditable');
      setButtons('view');
      self.isChangesetEdit = false;
      self.panel.find('.task-changeset-add').fadeIn(150);
      self.panel.find('.task-changeset .icons').fadeIn(150);
      deferred.resolve();
    } else {
      deferred.resolve();
    }

    return deferred.promise();
  };

  var onClose = function() {
    self.close();
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

  var onCreate = function() {
    self.isCreate = true;

    var opts = {};
    var topts = self.tracker.data('tasktracker_options');
    for(var p in topts ) {
      if ( /string|number|boolean/.test( typeof topts[p] ) ) {
        opts[p] = topts[p];
      }
    }

    opts.id = '';
    opts.trackerId = self.tracker.attr('id');
    opts.autoassign = topts.autoassign;
    opts._depth = task.depth;

    window.tasksapi.blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      self.isEdit = true;
      self.isView = false;
      setButtons('edit');

      // fill the editor
      // (missing data or at least reformat it; e.g. epoch to time string conversion)
      var $ed = $(response.editor).css('display', 'none');
      writeEditor($ed, task);
      if ( topts.autoassign && topts.autoassignTarget ) {
        var $type = $ed.find('select[name="Type"]');
        var $target = $ed.find('input[name="' + topts.autoassignTarget + '"]');

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
            setTimeout(function() {
              $target.trigger('Clear');
              $target.trigger('AddValue', assignTo);
            }, 100);
          } else {
            $target.closest('.' + topts.autoassignTarget).css('display', 'block');
            var tval = $target.val();
            if ( assignees.indexOf(val) === -1 && assignees.indexOf(tval) === -1 ) {
              $target.trigger('Clear');
            }
          }
        };

        $type.on('change', setAssignee);
        setAssignee.call($type);
      }

      self.savedStates.details.fadeOut(150, function() {
        self.savedStates.details.detach();
        self.savedStates.parent.append($ed);
        $ed.fadeIn(150);
      });
    }).fail( error ).always( window.tasksapi.unblockUI );
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
      self.trigger( beforeCreate, opts );
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

      var $ed = $(response.editor).css('display', 'none');
      self.savedStates.details = self.panel.find('.task-details:not(.attachments)');
      self.savedStates.parent = self.savedStates.details.parent();

      if ( !self.isCreate ) {
        // fill the editor
        // (missing data or at least reformat it; e.g. epoch to time string conversion)
        writeEditor($ed, task);
      }

      if ( topts.autoassign && topts.autoassignTarget ) {
        var $type = $ed.find('select[name="Type"]');
        var $target = $ed.find('input[name="' + topts.autoassignTarget + '"]');

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
            setTimeout(function() {
              $target.trigger('Clear');
              $target.trigger('AddValue', assignTo);
            }, 100);
          } else {
            $target.closest('.' + topts.autoassignTarget).css('display', 'block');
            var tval = $target.val();
            if ( assignees.indexOf(val) === -1 && assignees.indexOf(tval) === -1 ) {
              $target.trigger('Clear');
            }
          }
        };

        $type.on('change', setAssignee);
        setAssignee.call($type);
      }

      if ( self.isCreate ) {
        var $content = $('<div class="content"></div>');
        $content.append($ed);
        $content.appendTo(self.panel);
        toggleOverlay(true);
        $content.addClass('slide-in');
        $ed.fadeIn(150);
      } else {
        self.savedStates.details.fadeOut(150, function() {
          self.savedStates.details.detach();
          self.savedStates.parent.append($ed);
          $ed.fadeIn(150);

          var $tabs = self.panel.find('.jqTabGroup > li');
          if ( $tabs.length > 1 ) {
            $tabs.first().children('a').trigger('click');
          }
        });
      }
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
  };

  var readEditor = function(editor) {
    var data = {
      hasError: false
    };

    var missingFields = [];
    editor.find('input[name],select[name],textarea[name]').each(function() {
      var $input = $(this);
      var prop = $input.attr('name');
      var val = $input.val();

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

  var initReadmore = function($content) {
    $content = $content || self.panel.find('.content.slide-in');
    var $article = $content.find('.task-details > .content > .description article');
    setTimeout(function() {
      $article.readmore('destroy');
      $article.readmore({
        collapsedHeight: 150,
        speed: 400,
        lessLink: '<a class="readmore_link" href="#">' + jsi18n.get('tasksapi', 'Show less') + '</a>',
        moreLink: '<a class="readmore_link" href="#">' + jsi18n.get('tasksapi', 'Show more') + '</a>'
      });
    }, 100);
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

    var $nextView = nextTask.children('.task-fullview-container').children('.task-fullview');
    $nextView.detach().appendTo($content);
    $content.appendTo(self.panel);

    // destroy and re-init readmore.js
    initReadmore($content);
    sliceChanges($content.find('.changes'));

    setTimeout(function() {
      var $current = self.panel.children('.content.slide-in');
      $current.on('transitionend', function() {
        $current.off('transitionend').remove();

        var $view = $current.children('.task-fullview').detach();
        $view.appendTo(self.currentTask.children('.task-fullview-container'));
        self.currentTask = nextTask;
        isAnimating = false;

        setTimeout(function() {
          $current.remove();
        }, 300);
      });

      // switch contents
      $current.removeClass('slide-in');
      if ( direction === 'next' ) {
        $current.addClass('slide-out');
        $content.addClass('slide-in');
      } else {
        $content.addClass('slide-in').removeClass('slide-out');
      }
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
      self.currentTask.removeClass('highlight');
    } else {
      $current.empty();
    }

    self.currentTask = null;
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
      $a.on("click", function() {
        $changes.fadeIn("slow");
        $(this).remove();
        return false;
      });
    }
  };

  this.close = function() {
    if ( self.isUpload ) {
      toggleUpload();
    }

    if ( self.isEdit || self.isComment ) {
      onCancel().done( closeOverlay );
    } else {
      closeOverlay();
    }
  };

  this.createTask = function(parent) {
    self.isCreate = true;
    self.currentTask = null;
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

  this.viewTask = function($task) {
    if ( !isTask($task) ) {
      return;
    }

    self.isView = true;
    self.currentTask = $task;
    self.currentTask.addClass('highlight');

    var isEdit = self.isEdit || self.isCreate || self.isComment || self.isChangesetEdit;
    if ( isEdit && self.panel.children().length > 0 ) {
      self.panel.children().each(function() {
        var $child = $(this);
        $child.addClass('slide-out');
        setTimeout(function() {
          $child.remove();
        }, 400);
      });
    }

    var $content = $('<div class="content"></div>');
    var $view = $task.children('.task-fullview-container').children('.task-fullview');
    $view.detach().appendTo($content);
    $content.appendTo(self.panel);
    $content.addClass('slide-in');

    toggleOverlay(true);
    initReadmore($content);
    sliceChanges($content.find('.changes'));
  };

  this.next = function() {
    return animateTaskChange('next');
  };

  this.prev = function() {
    return animateTaskChange('prev');
  };

  return this;
};

  // var setLinkTarget = function() {
  //   var $panel = $('#task-panel').children('.content');
  //   $panel.find('a:not(.tasks-btn)').each(function() {
  //     var $link = $(this);
  //     if ( $link.attr('href') !== '#' ) {
  //       $link.attr('target', '_blank');
  //     }
  //   });
  // };
