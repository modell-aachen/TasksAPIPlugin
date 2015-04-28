;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.tasksGrid = function() {
    if ( typeof _ === typeof undefined ) {
      error( "Missing dependency underscore.js");
      return this;
    }

    return this.each(function () {
      var $this = $(this);

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      var opts = $.parseJSON( json );
      var decoded = decodeURIComponent( opts.template );
      var decodedNesting = decodeURIComponent( opts.nestingTemplate );

      opts.template = _.template( decoded );
      opts.nestingTemplate = _.template( decodedNesting );
      opts.canLoadMore = true;
      opts.page = 0;
      opts.cntHeight = $this.height();
      opts.container = $this.find('.tasks > div');

      opts.currentState = 'open';
      $this.data('tasktracker_options', opts);
      $.blockUI();
      loadTasks( $this, opts.currentState, true ).always( $.unblockUI );

      var $task_subbtn = $this.children('.task-subbtn-template').removeClass('task-subbtn-template').detach();
      opts.taskSubBtn = $task_subbtn;

      var $tasks = $this.children('.tasks');
      var $editor = $('#task-editor-' + id);
      var $filter = $this.children('.filter');
      var $status = $filter.find('select[name="status"]');
      var $save = $editor.find('.tasks-btn-save');
      var $cancel = $editor.find('.tasks-btn-cancel');
      var $create = $filter.find('.tasks-btn-create');

      $this.data('tasktracker_editor', $editor);

      $editor.dialog({
        autoOpen: false,
        closeOnEscape: true,
        modal: true,
        resizable: false
      });

      var closeEditor = function() {
        $tasks.removeClass('edit');
        $editor.dialog('close');
        $editor.removeData('subcontainer');
        $tasks.find('.task').removeClass('faded selected');
      };

      var handleCancel = function() {
        closeEditor();

        $.blockUI();
        releaseTopic().always( $.unblockUI ).fail( function( msg ) {
          error( msg );
        });

        return false;
      };

      var handleSave = function() {
        var task = readEditor( $editor );

        var beforeSave = $.Event( 'beforeSave' );
        $this.trigger( beforeSave, task ); 
        if( beforeSave.isDefaultPrevented() ) {
          return false;
        }

        // missing value for mandatory field
        if ( task === null ) {
          return false;
        }

        if ( $editor.data('new') === true ) {
          var now = moment();
          task.form = opts.form;
          task.Context = opts.context;
          $.blockUI();
          $.taskapi.create( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
            task.id = response.id;

            var $task = createTaskElement(response.data, opts);

            $editor.data('subcontainer').append( $task );
            $editor.data('new', '');

            var afterSave = $.Event( 'afterSave' );
            $this.trigger( afterSave, task );

            closeEditor();
          });

          return false;
        }

        var $task = $tasks.find('.selected');
        var taskId = $task.data('id');
        task.id = taskId;

        $.blockUI();
        $.taskapi.update( task ).fail( error ).done( function( response ) {
          var $newTask = createTaskElement(response.data, opts);
          $task.replaceWith($newTask);

          var afterSave = $.Event( 'afterSave' );
          $this.trigger( afterSave, task );

          closeEditor();
        }).always( $.unblockUI );

        return false;
      };

      var handleCreate = function() {
        var beforeCreate = $.Event( 'beforeCreate' );
        $this.trigger( beforeCreate ); 
        if( beforeCreate.isDefaultPrevented() ) {
          return false;
        }

        if (!$editor.data('subcontainer')) {
          $editor.data('subcontainer', opts.container);
        }

        $.blockUI();
        leaseTopic({
          form: opts.form
        }).done( function( response ) {
          updateHead( response.scripts );
          updateHead( response.styles );

          $editor.find('div').first().html(response.editor);
          $editor.dialog('open');

          $tasks.addClass('edit');
          if ($editor.data('parent')) {
            $editor.find('input[name="Parent"]').val($editor.data('parent'));
            $editor.removeData('parent');
          }

          $editor.data('new', true);
          highlightTask( opts.container.children(), null );

          var afterCreate = $.Event( 'afterCreate' );
          $this.trigger( afterCreate );
        }).fail( function( msg ) {
          error( msg );
        }).always( $.unblockUI );

        return false;
      };

      var handleStatusFilterChanged = function() {
        var $select = $(this);
        opts.currentState = $select.val();
        opts.container.empty();

        $.blockUI();
        loadTasks( $this, opts.currentState, true ).always( $.unblockUI );
      };

      $cancel.on( 'click', handleCancel );
      $save.on( 'click', handleSave );
      $create.on( 'click', handleCreate );
      $status.on( 'change', handleStatusFilterChanged );

      $this.on( 'afterSave', function( evt, task ) {
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

    var $tasks = container.parent();
    var $grid = $tasks.parent();

    opts.onEditClicked = function( evt ) {
      var id = $tracker.attr('id');
      var $editor = $('#task-editor-' + id);
      var $task = $(this).closest('.task');
      var selected = $task.data('task_data');

      var beforeEdit = $.Event( 'beforeEdit' );
      $tracker.trigger( beforeEdit, selected );
      if( beforeEdit.isDefaultPrevented() ) {
        return false;
      }

      var prefs = foswiki.preferences;
      var payload = {
        request: JSON.stringify({
          web: prefs.WEB,
          topic: prefs.TOPIC
        })
      };

      $.blockUI();
      leaseTopic({
        form: selected.form
      }).done( function( response ) {
        updateHead( response.scripts );
        updateHead( response.styles );

        $editor.find('div').first().html(response.editor);
        $tasks.addClass('edit');

        writeEditor( $editor, selected, $task );
        highlightTask( container.children(), $task );
        $editor.dialog('open');

        var afterEdit = $.Event( 'afterEdit' );
        $tracker.trigger( afterEdit );
      }).fail( function( msg ) {
        error( msg );
      }).always( $.unblockUI );
    };

    opts.onAddChildClicked = function( evt ) {
      var $editor = $tracker.data('tasktracker_editor');
      $editor.data('subcontainer', $(this).closest('.task-children').children('.task-children-list'));
      $editor.data('parent', $(this).closest('.task').data('id'));
      $tracker.find('.tasks-btn-create').first().click();
    };

    opts.onToggleChildrenClicked = function( evt ) {
      var $task = $(this).closest('.task');
      var $ccontainer = $task.find('.task-children-list');
      var $btn = $task.find('.nest').first().children();
      if ($task.is('.children-expanded')) {
        $ccontainer.empty();
        $task.removeClass('children-expanded');
        $btn.removeClass('contract');
        return;
      }
      $task.addClass('children-expanded');
      $btn.addClass('contract');
      $.blockUI();
      loadTasks($tracker, status, initial, $task.data('id'), $ccontainer).done(function() {
      }).fail(function() {
        $btn.removeClass('contract');
        $task.removeClass('children-expanded');
        error.apply(this, arguments);
      }).always(function() {
        $.unblockUI();
      });
    };

    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    var query = {
      Context: opts.context,
    };

    $.extend(query, $.parseJSON(opts.query));

    if ( !/^(1|true)$/i.test( opts.stateless ) ) {
      query.Status = status;
    }
    if (parent) {
      query.Parent = parent;
    } else {
      query.Parent = '';
    }

    $.taskapi.get(query, fetchSize, opts.page).done( function( response ) {
      _.each( response.data, function(entry) {

        var task = mapToTask( entry );
        container.append( createTaskElement(task, opts) );
      });

      deferred.resolve( response.data );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var timeout = null;
  var raiseClicked = function( evt ) {
    if ( $(evt.target).hasClass('btn-edit') ) {
      return false;
    }

    var self = this;
    if ( timeout === null ) {
      timeout = setTimeout( function() {
        timeout = null;
        var taskClick = $.Event( 'taskClick' );
        var $tracker = $(self).closest('.tasktracker');
        $tracker.trigger( taskClick, self ); 
      }, 250);
    } else {
      clearTimeout( timeout );
      timeout = null;
      raiseDoubleClicked( self );
    }
  };

  var raiseDoubleClicked = function( task ) {
    var taskDblClick = $.Event( 'taskDoubleClick' );
    var $tracker = $(task).closest('.tasktracker');
    $tracker.trigger( taskDblClick, task ); 
  };

  var createTaskElement = function(task, opts) {
    var $task;
    if (typeof task.fields.HasChildren !== 'undefined' && task.fields.HasChildren.value === 'Yes') {
      $task =  opts.nestingTemplate(extractValues(task));
    } else {
      $task = opts.template(extractValues(task));
    }
    $task = $($task);
    $task.data('id', task.id);
    $task.data('task_data', task);
    $task.on('click', raiseClicked );
    $task.find('.btn-edit').on('click', opts.onEditClicked);

    if ($task.is('.task-nesting')) {
      $task.find('.task-children-summary .add').append(opts.taskSubBtn.clone());
      $task.find('.task-child-add').click(opts.onAddChildClicked);
      $task.find('.nest').click(opts.onToggleChildrenClicked);
    }
    return $task;
  };

  var writeEditor = function( editor, task, $task ) {
    var $editor = $(editor);
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

      var $input = $editor.find(sel);
      if ( $input.length > 0 ) {

        var val = field.value;
        if ( field.type === 'date') {
          if ( !/^$/.test(val) ) {
            var due = moment( val, 'DD MMM YYYY' );
            $input.val( due.format('DD MMM YYYY') );
          }
        } else {
          $input.val( val );
        }
      }
    });
  };

  var clearEditor = function( editor ) {
    editor.find('input,textarea').each( function() {
      var $this = $(this);
      $this.val('');
      $this.trigger('Clear');
    });
  };

  var readEditor = function( editor ) {
    var $editor = $(editor);
    var data = {};

    var hasError = false;
    $editor.find('input[name],select[name],textarea[name]').each(function() {
      var $input = $(this);
      var prop = $input.attr('name');
      var val = $input.val();

      if ( /^$/.test(val) ) {
        val = $input.attr('value');
        if ( /^$/.test(val) ) {
          val = $input[0].getAttribute('value');
        }
      }

      if ( $input.hasClass('foswikiMandatory') && (/^$/.test( val ) || val === null || val === undefined ) ) {
        alert('TBD. missing value for mandatory field');
        hasError = true;
        return false;
      }

      data[prop] = val !== null ? val : "";
    });

    if ( hasError ) {
      return null;
    }

    return data;
  };

  var highlightTask = function( container, task ) {
    if ( task === null ) {
      container.each( function() {
        $(this).addClass('faded');
      });

      return;
    }

    var $task = $(task);
    container.each( function(){
      var $child = $(this);
      if ( $child[0] === $task[0] ) {
        $child.addClass('selected');
      } else {
        $child.addClass('faded');
      }
    });
  };

  var mapToTask = function( entry ) {
    _.each( entry.fields, function( field ) {
      if ( field.type === 'date' ) {
        if ( field.value ) {
          var date = moment(field.value, 'DD MMM YYYY');
          field.value = date.format('DD MMM YYYY');
        }
      }
    });

    return entry;
  };

  var extractValues = function( entry ) {
    var task = {};
    _.each( entry.fields, function( field ) {
      task[field.name] = field.value;
    });
    if (typeof entry.attachments !== 'undefined') {
      task.AttachCount = entry.attachments.length;
    }
    var prefs = foswiki.preferences;
    var id = entry.id.replace('.', '/');
    var url = [
      prefs.PUBURL,
      '/',
      id,
      '/'
    ];

    var $div = $('<div></div>');
    for(var i = 0; i < entry.attachments.length; ++i) {
      var a = entry.attachments[i];
      var $a = $('<a></a>');
      $a.attr('href', url.join('') + a.name );
      $a.text(a.name);
      var $li = $('<li></li>');
      $a.appendTo($li);
      $li.appendTo($div);
    }

    task.Attachments = $div.html();

    return task;
  };

  var error = function( msg ) {
    if ( !msg ) {
      return;
    }

    if ( window.console && console.error ) {
      console.error( msg );
    }
  };

  var log = function( msg ) {
    if ( !msg ) {
      return;
    }

    if ( window.console && console.log ) {
      console.log( msg );
    }
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

  var releaseTopic = function( data ) {
    if ( !_.isObject( data ) ) {
      data = {};
    }

    var prefs = foswiki.preferences;
    var defaults = {
      web: prefs.WEB,
      topic: prefs.TOPIC
    };

    $.extend( data, defaults );
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'release', payload );
  };

  var leaseTopic = function( data ) {
    if ( !_.isObject( data ) ) {
      data = {};
    }

    var prefs = foswiki.preferences;
    var defaults = {
      web: prefs.WEB,
      topic: prefs.TOPIC
    };

    $.extend( data, defaults );
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'lease', payload );
  };

  var updateHead = function( data ) {
    var $head = $('head');
    var html = $head.html();
    _.each( data, function( entry ) {
      var r = new RegExp( entry.id );

      // hotfix.. currently we are not able to dynamically load CKE
      if ( /CKEDITOR/.test(entry.id) ) { return; }

      if ( !r.test( html ) ) {
        _.each( entry.requires, function( require ) {
          var rr = new RegExp( require.id );
          if ( !rr.test( html ) ) {
            $(require.text).appendTo( $head );
          }
        });

        $(entry.text).appendTo( $head );
      }
    });
  };

  $(document).ready( function() {
    var onTaskClick = function( evt, task ) {
      $(task).toggleClass('expanded');
    };

    $('.tasktracker').each( function() {
      var $tracker = $(this);
      $tracker.tasksGrid();

      if ( /^1$/.test( $tracker.attr('data-expand') ) ) {
        $tracker.on( 'taskClick', onTaskClick );
      }
    });
  });
}(jQuery, window._, window.document, window));
