;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.taskEditor = function(opts) {
    if (this.length === 0) { return; }
    var $this = this;
    $this.data('id', _.isUndefined(opts.id) ? '' : opts.id);
    $this.data('parent', _.isUndefined(opts.parent) ? '' : opts.parent);

    if ( opts.trackerId ) {
      $this.data('trackerId', opts.trackerId);
    }

    var def = $.Deferred();
    var beforeEdit = $.Event( 'beforeEdit' );
    $this.trigger( beforeEdit, opts );
    if( beforeEdit.isDefaultPrevented() ) {
      def.resolve('cancel_plugin', opts);
      return def.promise();
    }

    var data = opts.data;
    delete opts.data;
    if (!data) {
      data = { fields: {} };
    }

    var evtResult = beforeEdit.result;
    if ( _.isObject( evtResult ) ) {
      opts = _.extend(opts, evtResult);
    }

    $.blockUI();
    leaseTopic(opts).done(function(response) {
      updateHead( response.scripts );
      updateHead( response.styles );

      var $ed = $('<div>' + response.editor + '</div>');
      $ed.find('.ma-taskeditor-cke').addClass('ignoreObserver');
      $this.html($ed.html());
      $this.find('.tasks-btn-save').click(handleSave);
      $this.find('.tasks-btn-cancel').click(handleCancel);
      writeEditor( data );

      if ( opts.autoassign && opts.autoassignTarget ) {
        var $type = $this.find('select[name="Type"]');
        var $target = $this.find('input[name="' + opts.autoassignTarget + '"]');

        var autoassign = opts.autoassign.split(',');
        var assign = {};
        var assignees = [];
        _.each( opts.autoassign.split(','), function(a) {
          var arr = a.split('=');
          assign[arr[0]] = arr[1];
          assignees.push(arr[1]);
        });

        var setAssignee = function() {
          var $self = $(this);
          var val = $self.val();
          var assignTo = assign[val];
          if ( assignTo ) {
            $target.closest('.' + opts.autoassignTarget).css('display', 'none');
            setTimeout(function() {
              $target.trigger('Clear');
              $target.trigger('AddValue', assignTo);
            }, 100);
          } else {
            $target.closest('.' + opts.autoassignTarget).css('display', 'block');
            var tval = $target.val();
            if ( assignees.indexOf(val) === -1 && assignees.indexOf(tval) === -1 ) {
              $target.trigger('Clear');
            }
          }
        };

        $type.on('change', setAssignee);
        setAssignee.call($type);
      }

      $this.panel = $this.taskPanel({
        show: function() {
          var $panel = this;
          $this.find('.ignoreObserver').removeClass('ignoreObserver');
          $this.detach().appendTo($panel);
        },
        hide: function() {
          handleCancel();
          $this.detach().empty().appendTo($('body'));
        }
      });

      $this.panel.show();

      var afterEdit = $.Event( 'afterEdit' );
      $this.trigger( afterEdit );
    }).fail(function(msg) {
      def.reject('lease', msg);
    }).always($.unblockUI);

    var closeEditor = function() {
      if ( !_.isUndefined(this) ) {
        $this.panel.hide();
      }
    };

    var handleCancel = function() {
      var self = this;
      var $up = $this.find('.qw-dnd-upload');
      if ($up.length) {
        $up.clearQueue();
      }

      var taskid = opts.id;
      if (!taskid) {
        def.resolve('cancel');
        closeEditor.call(self);
        return false;
      }

      $.blockUI();
      releaseTopic({ id: taskid }).always( $.unblockUI ).fail( function( msg ) {
        def.reject('cancel_clearlease', msg);
      }).done( function() {
        def.resolve('cancel', taskid);
      }).always(function() {
        closeEditor.call(self);
      });

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
        if ( /template|form/.test(prop) ) {
          task[prop] = opts[prop];
        }
      }

      if ( $this.data('parent') && !task.Parent ) {
        task.Parent = $this.data('parent');
      }

      var beforeSave = $.Event( 'beforeSave' );
      $this.trigger( beforeSave, task ); 
      if( beforeSave.isDefaultPrevented() ) {
        return false;
      }

      $.blockUI();
      var doSaveTask = function() {
        task._depth = opts._depth > 0 ? opts._depth : 0;
        if (!task.id) {
          task.Context = opts.context;

          $.taskapi.create( task ).fail( error ).always( $.unblockUI ).done( function( response ) {
            task.id = response.id;
            var afterSave = $.Event( 'afterSave' );
            $this.trigger( afterSave, task );
            closeEditor.call(1);
            def.resolve('save', response.data);
          });

          return;
        }

        $.taskapi.update( task ).fail( error ).done( function( response ) {
          var afterSave = $.Event( 'afterSave' );
          $this.trigger( afterSave, task );

          closeEditor.call(1);
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

        var $input = $this.find(sel);
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

