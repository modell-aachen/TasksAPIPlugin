;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.taskEditor = function(opts) {
    if (this.length === 0) { return; }
    var $this = this;

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

    var data = delete opts.data;
    if (!data) {
      data = { fields: {} };
    }
    var beforeEdit = $.Event( 'beforeEdit' );
    $this.trigger( beforeEdit, data );
    if( beforeEdit.isDefaultPrevented() ) {
      def.resolve('cancel_plugin', data);
      return def.promise();
    }

    $.blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      $this.html(response.editor);
      $this.find('.tasks-btn-save').click(handleSave);
      $this.find('.tasks-btn-cancel').click(handleCancel);

      writeEditor( data );
      $this.dialog('open');

      var afterEdit = $.Event( 'afterEdit' );
      $this.trigger( afterEdit );
    }).fail(function(msg) {
      def.reject('lease', msg);
    });

    var closeEditor = function() {
      $this.dialog('close');
    };

    var handleCancel = function() {
      $this.find('.qw-dnd-upload').clearQueue();
      var taskid;
      var task = $this.data('task');
      if (!task) {
        def.resolve('cancel');
        return;
      }
      task = task.data('task_data');
      taskid = task.id;
      closeEditor();

      $.blockUI();
      releaseTopic({ id: taskid }).always( $.unblockUI ).fail( function( msg ) {
        def.reject('cancel_clearlease', msg);
      }).done( function() {
        def.resolve('cancel', task);
      });
    };

    var handleSave = function() {
      var task = readEditor();

      var beforeSave = $.Event( 'beforeSave' );
      $this.trigger( beforeSave, task ); 
      if( beforeSave.isDefaultPrevented() ) {
        return false;
      }

      // missing value for mandatory field
      if ( task === null ) {
        return false;
      }

      $.blockUI();
      $this.find('.qw-dnd-upload').on('queueEmpty', function() {
        if ( $this.data('new') === true ) {
          var now = moment();
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
      });

      $this.find('.qw-dnd-upload').upload();
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
      var data = {};

      var hasError = false;
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
    return handleLease( 'lease', payload );
  };

  var loadScript = function( id, script ) {
    if ( /CKEDITORPLUGIN::SCRIPTS/.test( id ) ) {
      var scripts = $(script).wrap('<div></div>').find('script');
      var loadNext = function() {
        if (scripts.length === 0) { return; }
        var $script = scripts.shift();
        var src = $script.attr('src');
        if ( src ) {
          $.getScript( src ).then(loadNext);
        } else {
          $script.appendTo( $('head') );
          loadNext();
        }
      };
      loadNext();
    } else {
      $(script).appendTo( $('head') );
    }
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

