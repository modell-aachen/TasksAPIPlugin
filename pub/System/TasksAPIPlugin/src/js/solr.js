(function($) {
  var getOverlay = function() {
    var deferred = $.Deferred();

    var $overlay = $('.task-overlay');
    if ( $overlay.length > 0 ) {
      deferred.resolve($overlay);
    } else {
      var p = foswiki.preferences;
      var url = [
        p.SCRIPTURL,
        '/rest',
        p.SCRIPTSUFFIX,
        '/RenderPlugin/template',
        '?name=TasksAPIDefault',
        '&expand=tasksapi::overlay',
        '&render=on'
      ].join('');

      $.get(url, function(data) {
        var $overlay = $(data);
        $overlay.appendTo($('body'));
        
        $overlay.on('click', '.description > article a', function(evt) {
          var $link = $(this);
          if ( $link.attr('href') !== '#' ) {
            window.open($link.attr('href'), '_blank');
            return false;
          }

          evt.preventDefault();
        });

        $overlay.on('click', function(evt) {
          var $tgt = $(evt.target);
          if ( !($tgt.hasClass('close') || $tgt.hasClass('task-overlay') || $tgt.hasClass('fa-times')) ) {
            return false;
          }

          $overlay.find('.content').removeClass('slide-in');
          $overlay.children('.panel-wrapper').removeClass('active');
          $overlay.fadeOut(300);
          setTimeout(function() {
            $('body').css('overflow', '');
          }, 300);
        });

        deferred.resolve($overlay);
      });
    }

    return deferred.promise();
  };

  var showTask = function($task, taskId, attachment) {
    getOverlay().done(function($overlay) {
      var $panel = $overlay.find('> .panel-wrapper > .panel');
      var $content = $('<div class="content"></div>');
      var $view = $task.find('> .task-fullview-container > .task-fullview').detach();
      $view.appendTo($content);
      $panel.empty().append($content);

      $overlay.find('.panel-btn').remove();
      $overlay.find('.delete-attachment').replaceWith('<td></td>');
      $overlay.find('.task-changeset-add').remove();
      $overlay.find('.task-changeset-edit').remove();
      $overlay.find('.task-changeset-remove').remove();

      $overlay.on('click', '.task-attachments tbody tr', function(evt) {
        var $target = $(evt.target || evt. delegateTarget || evt.toElement);
        if ( $target.is('a.hidden') ) {
          return false;
        }

        var $row = $(this);
        var file = $(this).find('a.hidden').attr('href');
        var p = foswiki.preferences;
        var url = [
          p.SCRIPTURL,
          '/rest',
          p.SCRIPTSUFFIX,
          '/TasksAPIPlugin/download?id=',
          taskId,
          '&file=',
          file
        ].join('');

        window.open && window.open(url, '_blank');
        return false;
      });

      $overlay.fadeIn(300, function() {
        $('body').css('overflow', 'hidden');
        $overlay.children('.panel-wrapper').addClass('active');
        initReadmore($content);
        sliceChanges($content.find('.task-details').children('.changes'));
        $content.addClass('slide-in');

        if (attachment) {
          $content.find('ul.jqTabGroup li:last-child > a').trigger('click');
          var $links = $content.find('table.task-attachments tbody > tr a');
          var $tr = $links.filter('[href="' + attachment + '"]').closest('tr');
          highlightRow($tr, false);
        }

        $.unblockUI();
      });
    });
  };

  var highlightRow = function($row, stop) {
    setTimeout(function() {
      $row.css('background-color', '#c5e6ff');
      setTimeout(function() {
        $row.removeAttr('style');
        if (!stop) {
          highlightRow($row, !stop);
        }
      }, 300);
    }, 300);
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

  $(document).ready( function() {
    $('#solrSearch').on('click', '.task-solr-hit', function() {
      var $this = $(this);
      var id = $this.data('id');
      if ( !id ) {
        return false;
      }

      $.blockUI();
      $.taskapi.get({query: {id: id}}).done(function(response) {
        if ( response.status !== 'ok' || (response.data && response.data.length !== 1)) {
          // ToDo.
        }

        var task = response.data[0];
        var $task = $(task.html);
        showTask($task, id, $this.data('attachment') || false);
      });

      return false;
    });
  });
})(jQuery);
