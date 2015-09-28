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
        '?name=TasksAPI',
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

  var showTask = function($task) {
    getOverlay().done(function($overlay) {
      var $panel = $overlay.find('> .panel-wrapper > .panel');
      var $content = $('<div class="content"></div>');
      var $view = $task.find('> .task-fullview-container > .task-fullview').detach();
      $view.appendTo($content);
      $panel.empty();
      $content.appendTo($panel);
      $overlay.find('.panel-btn, .controls, .jqTabLabel').remove();
      $overlay.find('.task-changeset-add').remove();
      $overlay.find('.task-changeset-edit').remove();
      $overlay.find('.task-changeset-remove').remove();
      $overlay.fadeIn(300, function() {
        $('body').css('overflow', 'hidden');
        $overlay.children('.panel-wrapper').addClass('active');
        initReadmore($content);
        sliceChanges($content.find('.task-details').children('.changes'));
        $content.addClass('slide-in');
        $.unblockUI();
      });
    });
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
        showTask($task);
      });

      return false;
    });
  });
})(jQuery);
