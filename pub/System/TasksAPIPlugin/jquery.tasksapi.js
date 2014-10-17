(function($) {
  function restEndpoint( endpoint ) {
    var url = [
      foswiki.getPreference('SCRIPTURLPATH'),
      '/rest',
      foswiki.getPreference('SCRIPTSUFFIX')
    ].join('');

    return url + (/^\//.test( endpoint ) ? endpoint : '/' + endpoint);
  };

  function postTask( action, task ) {
    var deferred = $.Deferred();
    var url = restEndpoint('/TasksAPIPlugin/' + action);
    $.ajax({
      url: url,
      type: 'POST',
      data: task,
      error: function( xhr, status, err ) {
        deferred.reject({
          error: err,
          request: xhr,
          status: status
        });
      },
      success: function( response, status, xhr ) {
        deferred.resolve( response );
      }
    });

    return deferred.promise();
  };

  $.taskapi = {
    opts: {limit: 9999},

    create: function( data ) {
      return postTask( 'create', data );
    },

    get: function( query, limit ) {
      if ( !limit || /^\d+$/.test( limit ) === false ) {
        limit = (this.opts && this.opts.limit) || 9999;
        if ( !query ) query = '';
      }

      var deferred = $.Deferred();
      var url = restEndpoint('/SolrPlugin/search');
      var q = "type: task";
      if ( query ) {
        if ( /type:\s?task/.test( query ) ) {
          q = query;
        } else {
          q += query;
        }
      }

      $.ajax({
        url: url + '?q=' + q + '&rows=' + limit,
        type: 'GET',
        error: function( xhr, status, err ) {
          deferred.reject({
            error: err,
            request: xhr,
            status: status
          });
        },
        success: function( response, status, xhr ) {
          deferred.resolve( response );
        }
      });

      return deferred.promise();
    },

    getAll: function( limit ) {
      return this.get( 'type:task', limit );
    },

    getBy: function( filter, limit ) {
      var opts = ['type:task'];
      if ( typeof filter === 'object' ) {
        for ( var prop in filter ) {
          opts.push( prop + ':' + filter[prop] );
        }
      }

      return this.get( opts.join(' '), limit );
    },

    update: function( task ) {
      return postTask( 'update', task );
    }
  }
})(jQuery);
