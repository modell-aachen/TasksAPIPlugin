TasksPanel = function(tasktracker) {
  var self = this;
  var listeners = {};
  TasksPanel.prototype.on = function(name, callback) {
    if ( typeof callback !== 'function' ) {
      return;
    }

    if ( !listeners[name] ) {
      listeners[name] = [];
    }

    listeners[name].push(callback);
  };

  TasksPanel.prototype.trigger = function() {
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

  this.currentTask = null;
  this.tracker = tasktracker;
  this.overlay = this.tracker.find('> .overlay > .task-overlay');

  this.comment = this.overlay.find('> .panel-wrapper > .textarea');
  this.panel = this.overlay.find('> .panel-wrapper > .panel');
  this.upload = this.overlay.find('> .panel-wrapper > .upload');

  this.buttons = {
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
    self.buttons.cancel.off('click');
    self.buttons.close.off('click');
    self.buttons.comment.off('click');
    self.buttons.edit.off('click');
    self.buttons.next.off('click');
    self.buttons.previous.off('click');
    self.buttons.save.off('click');
    self.buttons.upload.off('click');
    self.overlay.off('click');

    self.panel.off('click', '.tasks-btn-close');
    self.panel.off('click', '.task-changeset-edit');
    self.panel.off('keydown', '.task-changeset-comment');
  };

  var attachHandler = function() {
    detachHandler();

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
    self.overlay.on('click', function(evt) {
      if ( self.isEdit || self.isChangesetEdit || self.isComment || self.isUpload ) {
        return;
      }

      var $target = $(evt.target || evt. delegateTarget || evt.toElement);
      if ( $target.hasClass('task-overlay') ) {
        self.close();
      }
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

    self.panel.on('click', '.task-changeset-edit', function() {
      if ( self.isChangesetEdit ) {
        return;
      }

      var $comment = $(this).closest('.task-changeset').find('.task-changeset-comment');
      $comment.data('saved_comment', $comment.html());
      $comment.attr('contenteditable', true);
      $comment.focus();
      self.isChangesetEdit = true;
      setButtons('edit');
      self.panel.find('.task-changeset-edit').fadeOut(150);

      return false;
    });

    // ToDo
    self.panel.on('click', '.tasks-btn-close', function() {
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
console.log('ToDo');

          var payload = {
            id: self.currentTask.data('id'),
            Status: 'closed'
          };

          // $.blockUI();
          // $.taskapi.update(payload).fail(error).done(function(response) {
          //   $task.remove();
          //   if ($next.hasClass('task-children-container')) {
          //     $next.remove();
          //   }
          //   swal('Erledigt!', 'Protokollpunkt wurde als geschlossen markiert.', 'success');
          // }).always($.unblockUI);
        }

        return confirmed;
      });

      return false;
    });
  };

  // destroy any remaining instance of CKEditor
  var killCKE = function() {
    if ( CKEDITOR && CKEDITOR.instances ) {
      for (var p in CKEDITOR.instances) {
        CKEDITOR.instances[p].destroy();
      }
    }
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

  var cancelEdit = function() {
    if ( !self.isCreate ) {
      releaseTopic({ id: self.currentTask.data('id') });
    }

    if ( self.savedStates.details !== null && self.savedStates.parent !== null ) {
      self.savedStates.parent.fadeOut(200, function() {
        if ( !self.isCreate ) {
          self.savedStates.parent.empty();
        }

        self.savedStates.details.appendTo(self.savedStates.parent);

        // set by a previous call to fadeOut
        self.savedStates.details.attr('style', '');
        setTimeout(function() {
          initReadmore(self.savedStates.parent);
        }, 50);

        self.savedStates.parent.fadeIn(200, function() {
          self.savedStates.details = self.savedStates.parent = null;
        });
      });
    }

    self.isEdit = false;
    self.isView = true;
    self.isCreate = false;

    killCKE();
    setButtons('view');
  };

  var handleSaveTask = function() {
    var task = readEditor(self.panel);
    task.id = self.isCreate ? null : self.currentTask.data('task_data').id;
    var opts = self.tracker.data('tasktracker_options');

    // missing value for mandatory field
    if ( task.hasError ) {
      var msg = decodeURIComponent(opts.lang.missingField) + ': ' + task.missingFields;
      alert(msg);
      return false;
    }

    for (var prop in opts) {
      if ( /template|form/.test(prop) ) {
        task[prop] = opts[prop];
      }
    }

    // if ( $this.data('parent') && !task.Parent ) {
    //   task.Parent = $this.data('parent');
    // }

    var beforeSave = $.Event( 'beforeSave' );
    self.trigger( beforeSave, task ); 
    if( beforeSave.isDefaultPrevented() ) {
      return false;
    }

    blockUI();
    task._depth = opts._depth > 0 ? opts._depth : 0;
    if ( self.isCreate ) {
      task.Context = self.tracker.data('tasktracker_options').context;
      if ( !task.Status ) {
        task.Status = 'open';
      }

      $.taskapi.create( task ).fail( error ).always( unblockUI ).done( function( response ) {
        task.id = response.id;
        var afterSave = $.Event( 'afterSave' );
        self.trigger( afterSave, response.data );
        cancelEdit();
      });
    } else {
      $.taskapi.update( task ).fail( error ).done( function( response ) {
        var afterSave = $.Event( 'afterSave' );
        self.trigger( afterSave, response.data );

        var $task = $(createTaskElement(response.data));
        var $container = $task.children('.task-fullview-container');
        var $details = $container.find('> .task-fullview .task-details:first-child');
        self.currentTask = $task;
        $details.detach();
        self.savedStates.details = $details;
        cancelEdit();
      }).always( unblockUI );
    }

    return false;
  };

  var handleSaveComment = function() {
    var $textarea = self.overlay.find('textarea[name="TaskComment"]');
    var $cb = $textarea.parent().find('input[name="close"]');
    var comment = $textarea.val();

    var opts = self.tracker.data('tasktracker_options') || {};
    var payload = {
      id: self.currentTask.data('id'),
      comment: comment
    };

    $.extend(payload, _.pick(opts, 'form', 'tasktemplate', 'templatefile'));
    var close = $cb.attr('checked');
    if ( close ) {
      payload.Status = 'closed';
    }

    blockUI();
    $.taskapi.update(payload).fail(error).done(function(response) {
      var $task = $(createTaskElement(response.data));
      self.currentTask = $task;

      var $container = $task.children('.task-fullview-container');
      var $view = $container.children('.task-fullview').detach();
      $view.css('display', 'none');
      var $old = self.panel.find('.task-fullview:first-child');
      $old.fadeOut(200, function() {
        $old.replaceWith($view);
        $view.fadeIn(200);
        setTimeout(function() {
          initReadmore($view);
        }, 50);
      });

      // cancel/exit "comment composer"
      onCancel();

      // ToDo. re-apply
      // var expanded = $task.is('.expanded');
      // $task.replaceWith( $newTask );

      // if (expanded) {
      //   $newTask.next().remove();
      //   var $expander = $newTask.children('.expander');
      //   toggleTaskExpand.call($expander);
      // }

      // $tracker.panel.replace.call(self, $newTask);
      // if ( close ) {
      //   $('.tasks-btn-next:visible').trigger('click');
      // }
    }).always(unblockUI);

    return false;
  };

  var handleSaveChangeset = function() {
    var $set = self.panel.find('[contenteditable="true"]');
    $set.data('saved_comment', '');

    var payload = {
      id: self.currentTask.data('id'),
      cid: $set.data('id'),
      comment: $set.html()
    };

    var opts = self.tracker.data('tasktracker_options') || {};
    $.extend(payload, _.pick(opts, 'form', 'tasktemplate', 'templatefile'));

    blockUI();
    $.taskapi.update(payload).fail(error).always(unblockUI).done(function(response) {
      var $task = $(createTaskElement(response.data));
      self.currentTask = $task;

      // reset ui/buttons, switch back to "view mode"
      onCancel();

      var $container = $task.children('.task-fullview-container');
      var $view = $container.children('.task-fullview').detach();
      $view.css('display', 'none');
      var $old = self.panel.find('.task-fullview:first-child');
      $old.fadeOut(200, function() {
        $old.replaceWith($view);
        $view.fadeIn(200);
        setTimeout(function() {
          initReadmore($view);
        }, 50);
      });
    });
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

    // ToDo. track changes, ask for confirmation
    if ( self.isEdit ) {
      if ( checkDirty() ) {
        // ToDo. localization
        swal({
          title: 'Sind Sie sicher?',
          text: 'ToDo. meaningful message here',
          type: 'error',
          showCancelButton: true,
          confirmButtonColor: '#6CCE86',
          cancelButtonColor: '#BDBDBD',
          confirmButtonText: 'Ja',
          cancelButtonText: 'Nein',
          closeOnConfirm: true
        }, function(confirmed) {
          if ( confirmed ) {
            cancelEdit();
            deferred.resolve();
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
      $comment.text($comment.data('saved_comment'));
      $comment.data('saved_comment', '');
      $comment.removeAttr('contenteditable');
      setButtons('view');
      self.isChangesetEdit = false;
      self.panel.find('.task-changeset-edit').fadeIn(150);
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

    blockUI();
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
    }).fail( error ).always( unblockUI );
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

    blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      self.isEdit = true;
      self.isView = false;
      setButtons('edit');

      var $ed = $(response.editor).css('display', 'none');
      self.savedStates.details = self.panel.find('.task-details');
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
        });
      }
    }).fail( error ).always( unblockUI );

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
        missingFields.push(fname);
        data.hasError = true;
        return false;
      }

      data[prop] = val !== null ? val : "";
    });

    if ( data.hasError ) {
      data.missingFields = missingFields.join(', ');
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
    return false;
  };

  var error = function() {
    if ( window.console && console.error ) {
      console.error.apply(console, arguments);
    }
  };

  var blockUI = function() {
    var p = foswiki.preferences;
    var url = [
      p.PUBURLPATH,
      '/',
      p.SYSTEMWEB,
      '/TasksAPIPlugin/assets/ajax-loader.gif'
    ];

    swal({
      text: 'Please wait...',
      type: null,
      imageUrl: url.join(''),
      imageSize: '220x19',
      showCancelButton: false,
      showConfirmButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false
    });
  };

  var unblockUI = function() {
    swal.closeModal();
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
    $article.readmore('destroy');
    $article.readmore({
      collapsedHeight: 150,
      speed: 400,
      // ToDo.: template..
      lessLink: '<a class="readmore_link" href="#">Weniger anzeigen</a>',
      moreLink: '<a class="readmore_link" href="#">Mehr anzeigen</a>'
    });
  };

  var animateTaskChange = function(direction) {
    if ( !self.currentTask || self.isEdit ) {
      return;
    }

    var nextTask = getSibling(self.currentTask, direction);

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

    var $current = self.panel.children('.content.slide-in');
    $current.on('transitionend', function() {
      var $this = $(this);
      var $view = $this.children('.task-fullview').detach();
      $this.remove();
      $view.appendTo(self.currentTask.children('.task-fullview-container'));
      self.currentTask = nextTask;
    });

    // destroy and re-init readmore.js
    initReadmore($content);

    // switch contents
    if ( direction === 'next' ) {
      $current.addClass('slide-out');
      setTimeout(function() {
        $content.addClass('slide-in');
      }, 10);
    } else {
      $current.removeClass('slide-in');
      setTimeout(function() {
        $content.addClass('slide-in').removeClass('slide-out');
      }, 10);
    }

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
    if ( !self.isCreate ) {
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
    // self.isView = true;
    self.isCreate = true;
    self.currentTask = null;
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

    var $content = $('<div class="content"></div>');
    var $view = $task.children('.task-fullview-container').children('.task-fullview');
    $view.detach().appendTo($content);
    $content.appendTo(self.panel);

    toggleOverlay(true);
    initReadmore($content);
    $content.addClass('slide-in');
  };

  this.next = function() {
    return animateTaskChange('next');
  };

  this.prev = function() {
    return animateTaskChange('prev');
  };
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
