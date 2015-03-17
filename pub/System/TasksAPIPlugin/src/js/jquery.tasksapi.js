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
      dataType: 'json',
      data: task,
      error: function( xhr, status, err ) {
        deferred.reject({
          error: err,
          request: xhr,
          status: status
        });
      },
      success: function( response, status, xhr ) {
        var retval;
        if ( typeof response === 'string' ) {
          retval = $.parseJSON( response );
        } else {
          retval = response;
        }

        deferred.resolve( retval );
      }
    });

    return deferred.promise();
  };

  $.taskapi = {
    opts: {limit: 9999},

    create: function( data ) {
      return postTask( 'create', data );
    },

    get: function( query, limit, offset, sort ) {
      if ( !limit || /^\d+$/.test( limit ) === false ) {
        limit = (this.opts && this.opts.limit) || 9999;
        if ( !query ) query = '';
      }

      if ( !offset || /^\d+$/.test( offset ) === false ) {
        offset = 0;
      }

      var sortBy = '';
      if ( sort ) {
        sortBy = '&sort=' + sort;
      }

      var deferred = $.Deferred();
      var url = restEndpoint('/SolrPlugin/search');
      var q = "type: task ";
      if ( query ) {
        if ( /type:\s?task/.test( query ) ) {
          q = query;
        } else {
          q += query;
        }
      }

      $.ajax({
        url: url + '?q=' + q + '&rows=' + limit + '&start=' + offset + sortBy,
        type: 'GET',
        dataType: 'json',
        error: function( xhr, status, err ) {
          deferred.reject({
            error: err,
            request: xhr,
            status: status
          });
        },
        success: function( response, status, xhr ) {
          var retval;
          if ( typeof response === 'string' ) {
            retval = $.parseJSON( response );
          } else {
            retval = response;
          }

          deferred.resolve( retval );
        }
      });

      return deferred.promise();
    },

    getAll: function( limit, offset, sort ) {
      return this.get( 'type:task', limit, offset, sort );
    },

    getBy: function( filter, limit, offset,sort ) {
      var opts = ['type:task'];
      if ( typeof filter === 'object' ) {
        for ( var prop in filter ) {
          opts.push( prop + ':' + filter[prop] );
        }
      } else if ( typeof filter === 'string' ) {
        opts.push( filter );
      }

      return this.get( opts.join(' '), limit, offset );
    },

    update: function( task ) {
      return postTask( 'update', task );
    },

    multiupdate: function( data ) {
      return postTask( 'multiupdate', data );
    }
  }
})(jQuery);
