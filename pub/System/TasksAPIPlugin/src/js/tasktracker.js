;(function ($, _, document, window, undefined) {
  'use strict';

  var options = {};
  var tasks = {};

  $.fn.tasksGrid = function() {
    return this.each(function () {
      var $this = $(this);

      var id = $this.attr('id');
      var json = $this.children('.settings').text();
      var opts = $.parseJSON( json );
      var decoded = decodeURIComponent( opts.template );

      opts.template = _.template( decoded );
      opts.canLoadMore = true;
      opts.page = 0;
      opts.cntHeight = $this.height();
      opts.container = $this.find('.tasks > div');

      options[id] = opts;
      loadTasks( id, true );

      var $tasks = $this.children('.tasks');
      var $editor = $this.children('.editor');
      var $save = $editor.find('.btn-save');
      var $cancel = $editor.find('.btn-cancel');

      var handleScroll = function( evt ) {
        var $this = $(this);
        var opts = options[id];
        var st = $this.scrollTop();
        var current = parseInt(st/opts.cntHeight);
        if ( opts.canLoadMore && current > opts.page ) {
          opts.page = current;
          $.blockUI();
          loadTasks( id ).done( function( results ) {
            opts.canLoadMore = results.length > 0;
          }).always( $.unblockUI );
        }
      };

      var handleCancel = function() {
        $tasks.removeClass('edit');
        $editor.removeClass('active');
        $tasks.find('.task').removeClass('faded selected');

        $editor.find('input,select,textarea').each( function() {
          var $input = $(this);
          $input.val('');
          $input.trigger('Clear');
        });

        return false;
      };

      var handleSave = function() {
        var $task = $tasks.find('.selected');
        var taskId = $task.data('id');
        var selected = _.findWhere( tasks[id], {id: taskId} );
        var fields = getFieldDefinitions( selected );
        var task = readEditor( $editor );
        task.id = taskId;

        $.blockUI();
        $.taskapi.update( task ).fail( error ).always( $.unblockUI ).done( function() {
          var $newTask = $(opts.template(task));
          $task.html( $newTask.html() );
          $task.find('.btn-edit').on('click', options[id].onEditClicked);

          updateStoredTask( selected, task, fields );
          $cancel.click();
        });

        return false;
      };

      $tasks.on( 'scroll', handleScroll );
      $cancel.on( 'click', handleCancel );
      $save.on( 'click', handleSave );

      return this;
    });
  };

  var loadTasks = function( id, initial ) {
    var deferred = $.Deferred();

    var opts = options[id];
    if ( !tasks[id] || typeof tasks[id].length !== 'number' ) {
      tasks[id] = [];
    }

    var $tasks = opts.container.parent();
    var $grid = $tasks.parent();
    var $editor = $grid.children('.editor');

    opts.onEditClicked = function( evt ) {
      var id = $(this).closest('.tasktracker').attr('id');
      var $task = $(this).closest('.task');
      $editor.addClass('active');
      $tasks.addClass('edit');

      var selected = _.findWhere( tasks[id], {id: $task.data('id')} );
      var fields = getFieldDefinitions( selected );
      writeEditor( $editor, fields, selected );
      highlightTask( opts.container.children(), $task );
    };

    var fetchSize = opts.pageSize * (initial === true ? 2 : 1);
    $.taskapi.get(opts.query, fetchSize, opts.page).done( function( solr ) {
      var docs = solr.response.docs;
      for( var i = 0; i < docs.length; ++i ) {
        var doc = docs[i];
        tasks[id].push( doc );

        var task = mapToTask( doc );
        var html = opts.template( task );
        var $html = $(html);
        $html.data('id', doc.id);
        opts.container.append( $html );

        $html.find('.btn-edit').on('click', opts.onEditClicked );
      }

      deferred.resolve( docs );
    }).fail( deferred.reject );

    return deferred.promise();
  };

  var getFieldDefinitions = function( solrEntry ) {
    var props = Object.getOwnPropertyNames( solrEntry );
    var fieldNames = _.filter( props, function( item ) {
      return /^field_/.test( item );
    });

    var fields = [];
    _.each( fieldNames, function( name ) {
      var match = name.match( /^field_(.+)_(.+)/ );
      if ( match && match.length > 2 ) {
        var field = {
          name: match[1],
          type: match[2],
          raw: name
        };

        fields.push( field );
      }
    });

    return fields;
  };

  var writeEditor = function( editor, fields, data ) {
    var $editor = $(editor);
    _.each( fields, function( field ) {
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

        var val = data[field.raw];
        if ( field.type === 'lst' ) {
          if ( !/^https?:\/\//.test(val) ) {
            $input.trigger('AddValue', val );
          }
        } else if ( field.type === 'dt') {
          var due = moment( val );
          $input.val( due.format('DD MMM YYYY') );
        } else {
          $input.val( data[field.raw] );
        }
      }
    });
  };

  var readEditor = function( editor ) {
    var $editor = $(editor);
    var data = {};

    $editor.find('input[name],select[name],textarea[name]').each(function() {
      var $input = $(this);
      var prop = $input.attr('name');
      data[prop] = $input.val();
    });

    return data;
  };

  var highlightTask = function( container, task ) {
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

  var mapToTask = function( solrEntry ) {
    var task = {id: solrEntry.id};
    var fields = getFieldDefinitions( solrEntry );
    _.each( fields, function( field ) {
      var val = solrEntry[field.raw];
      if ( field.type === 'dt' ) {
        var date = moment(val);
        val = date.format('DD MMM YYYY')
      }

      task[field.name] = val;
    });

    return task;
  };

  var updateStoredTask = function( solrEntry, data, fields  ) {
    var newFields = [];
    var props = Object.getOwnPropertyNames( data );
    _.each( props, function( prop ) {
      var field = _.findWhere( fields, {name: prop} );
      if ( typeof field === 'object' ) {
        field.value = data[prop];
        newFields.push( field );
      }
    });

    _.each( newFields, function( field ) {
      solrEntry[field.raw] = field.value;
    });
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

  $(document).ready( function() {
    $('.tasktracker').tasksGrid();
  });
}(jQuery, window._, window.document, window));
