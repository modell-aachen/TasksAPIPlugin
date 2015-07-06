;(function ($, _, document, window, undefined) {
  'use strict';

  $.fn.taskPanel = function(opts) {
    if ( $('#task-panel').length === 0 ) {
      $('<div id="task-panel"><div class="close"></div><div class="content"></div></div>').appendTo('body');
      $('<div id="task-overlay"></div>').appendTo('body');
    }

    $('#task-panel > .close').off('click').on('click', function() {
      toggleDetails(opts);
    });

    var $container = $('#task-panel');
    var $panel = $container.children('.content');

    var toggle = function() {
      var self = this;
      setTimeout(function() {
        toggleDetails(self);
      }, 100);
    };

    return {
      show: function() {
        toggle.call(opts);
      },
      hide: function() {
        toggle.call(opts);

        if ( CKEDITOR && CKEDITOR.instances ) {
          for (var p in CKEDITOR.instances) {
            CKEDITOR.instances[p].destroy();
          }
        }
      }
    };
  };

  var toggleDetails = function(opts) {
    var $overlay = $('#task-overlay');
    var $panel = $('#task-panel').children('.content');
    var $body = $('body');

    $overlay.toggleClass('active');
    if ( $overlay.hasClass('active') ) {
      $body.css('overflow', 'hidden');
      $overlay.show();

      if ( typeof opts.show === 'function' ) {
        opts.show.call($panel);
      }
    } else {
      $overlay.hide();
      $body.css('overflow', '');

      if ( typeof opts.hide === 'function' ) {
        opts.hide.call($panel);
      }
    }

    $('#task-panel').toggleClass('active');
  };
}(jQuery, window._, window.document, window));
