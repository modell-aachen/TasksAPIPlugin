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
      if ( !query ) query = {};
      if ( !limit || /^\d+$/.test( limit ) === false ) {
        limit = (this.opts && this.opts.limit) || 9999;
      }
      query.limit = limit;

      if ( !offset || /^\d+$/.test( offset ) === false ) {
        offset = 0;
      }
      query.offset = offset;

      if ( sort ) {
        query.order = sort;
      }

      var deferred = $.Deferred();
      var url = restEndpoint('/TasksAPIPlugin/search');

      $.ajax({
        url: url + '?request=' + JSON.stringify(query),
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
      return this.get( {}, limit, offset, sort );
    },

    getBy: function( filter, limit, offset,sort ) {
      return this.get( filter, limit, offset, sort );
    },

    update: function( task ) {
      return postTask( 'update', task );
    },

    multiupdate: function( data ) {
      return postTask( 'multiupdate', data );
    }
  }
})(jQuery);
