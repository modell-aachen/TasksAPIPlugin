;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.taskEditor = function(opts) {
    if (this.length === 0) { return; }
    var $this = this;
    $this.data('id', _.isUndefined(opts.id) ? '' : opts.id);
    if ( opts.trackerId ) {
      $this.data('trackerId', opts.trackerId);
    }

    if (!$this.is('.task-editor-init')) {
      $this.dialog({
        autoOpen: false,
        closeOnEscape: false,
        modal: true,
        resizable: false
      });

      $this.addClass('task-editor-init');
    }

    var def = $.Deferred();
    var data = opts.data;
    delete opts.data;
    if (!data) {
      data = { fields: {} };
    }

    var beforeEdit = $.Event( 'beforeEdit' );
    $this.trigger( beforeEdit, data );
    if( beforeEdit.isDefaultPrevented() ) {
      def.resolve('cancel_plugin', data);
      return def.promise();
    }

    var evtResult = beforeEdit.result;
    if ( _.isObject( evtResult ) ) {
      delete evtResult.id;
      $.extend(opts, evtResult);
    }

    $.blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      $this.html(response.editor);
      $this.find('.tasks-btn-save').click(handleSave);
      $this.find('.tasks-btn-cancel').click(handleCancel);
      writeEditor( data );

      if ( opts.autoassign && opts.autoassign.enabled ) {
        var $target = $(opts.autoassign.target).find('input');
        var triggers = opts.autoassign.assignOn.split(',');
        var assignee = opts.autoassign.assignee;
        var $selector = $(opts.autoassign.selector);

        // set initial value
        if ( triggers.indexOf($selector.val()) !== -1 && /^\s*$/.test($target.val())) {
          setTimeout(function() {
            $target.trigger('AddValue', assignee);
            $(opts.autoassign.target).find('.jqTextboxListClose').css('display', 'none');
          }, 300);
        }

        // handle changes
        $selector.on('change', function() {
          var $self = $(this);

          if ( triggers.indexOf($self.val()) !== -1 ) {
            if ( $target.val() !== assignee ) {
              $self.data('autoassign-prev', $target.val());
            }

            $target.trigger('Clear');
            $target.trigger('AddValue', assignee);
            $(opts.autoassign.target).find('.jqTextboxListClose').css('display', 'none');
          } else {
            $target.trigger('Clear');
            if ( $self.data('autoassign-prev') && $target.val() === assignee ) {
              $target.trigger('AddValue', $self.data('autoassign-prev'));
              $self.data('autoassign-prev', '');
              $(opts.autoassign.target).find('.jqTextboxListClose').css('display', 'inline');
            }
          }
        });
      }

      $this.dialog('open');

      var afterEdit = $.Event( 'afterEdit' );
      $this.trigger( afterEdit );
    }).fail(function(msg) {
      def.reject('lease', msg);
    }).always($.unblockUI);

    var closeEditor = function() {
      $this.dialog('close');
    };

    var handleCancel = function() {
      var $up = $this.find('.qw-dnd-upload');
      if ($up.length) {
        $up.clearQueue();
      }

      var taskid = opts.id;
      if (!taskid) {
        closeEditor();
        def.resolve('cancel');
        return false;
      }

      $.blockUI();
      releaseTopic({ id: taskid }).always( $.unblockUI ).fail( function( msg ) {
        def.reject('cancel_clearlease', msg);
      }).done( function() {
        def.resolve('cancel', taskid);
      }).always( closeEditor );

      return false;
    };

    var handleSave = function() {
      var task = readEditor();

      // missing value for mandatory field
      if ( task.hasError ) {
        var msg = decodeURIComponent(opts.lang.missingField) + ': ' + task.missingFields;
        alert(msg);
        return false;
      }

      for (var prop in opts) {
        if ( /template/.test(prop) ) {
          task[prop] = opts[prop];
        }
      }

      var beforeSave = $.Event( 'beforeSave' );
      $this.trigger( beforeSave, task ); 
      if( beforeSave.isDefaultPrevented() ) {
        return false;
      }

      $.blockUI();
      var doSaveTask = function() {
        if (!task.id) {
          task.form = opts.form;
          task.Context = opts.context;

          $.taskapi.create( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
            task.id = response.id;
            var afterSave = $.Event( 'afterSave' );
            $this.trigger( afterSave, task );
            closeEditor();
            def.resolve('save', response.data);
          });

          return;
        }

        $.taskapi.update( task ).fail( error ).done( function( response ) {
          var afterSave = $.Event( 'afterSave' );
          $this.trigger( afterSave, task );

          closeEditor();
          def.resolve('save', response.data);
        }).always( $.unblockUI );
      };

      var $up = $this.find('.qw-dnd-upload');
      if ($up.length) {
        $up.on('queueEmpty', doSaveTask);
        $up.upload();
      } else {
        doSaveTask();
      }
      return false;
    };

    var writeEditor = function( task ) {
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

        $this.find(sel).val(field.value);
      });
    };

    var readEditor = function() {
      var data = {
        id: $this.data('id'),
        hasError: false
      };

      var missingFields = [];
      $this.find('input[name],select[name],textarea[name]').each(function() {
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

    return def.promise();
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
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'release', payload );
  };

  var leaseTopic = function( data ) {
    var payload = {request: JSON.stringify( data )};
    return handleLease( 'lease', payload, data.id );
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
}(jQuery, window._, window.document, window));

