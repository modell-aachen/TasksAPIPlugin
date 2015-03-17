module.exports = function(grunt) {
  require('time-grunt')(grunt);

  var pkg = grunt.file.readJSON('package.json');
  var isPlugin = /Plugin$/.test( pkg.name );
  pkg.pubDir = 'pub/System/' + pkg.name;
  pkg.dataDir = 'data/System';
  pkg.libDirBase = 'lib/Foswiki/' + (isPlugin ? 'Plugins/': 'Contrib/');
  pkg.libDir = pkg.libDirBase + pkg.name;

  try {
    var bowerrc = grunt.file.readJSON('.bowerrc');
    pkg.bower = bowerrc.directory;
  } catch( e ) {
    pkg.bower = 'bower_components'
  }

  grunt.initConfig({
    pkg: pkg,

    sass: {
      dev: {
        options: {
          outputStyle: 'nested',
        },
        files: {
          "<%= pkg.pubDir %>/css/tasktracker.css": "<%= pkg.pubDir %>/src/scss/tasktracker.scss"
        }
      },
      dist: {
        options: {
          outputStyle: 'compressed'
        },
        files: {
          "<%= pkg.pubDir %>/css/tasktracker.min.css": "<%= pkg.pubDir %>/src/scss/tasktracker.scss"
        }
      }
    },

    uglify: {
      dev: {
        options: {
          beautify: true,
          compress: false,
          mangle: false,
          preserveComments: 'all'
        },
        files: {
          '<%= pkg.pubDir %>/js/tasktracker.js': [
            '<%= pkg.pubDir %>/src/js/tasktracker.js'
          ],
          '<%= pkg.pubDir %>/js/jquery.tasksapi.uncompressed.js': [
            '<%= pkg.pubDir %>/src/js/jquery.tasksapi.js'
          ]
        }
      },
      dist: {
        options: {
          compress: true,
          mangle: true,
          preserveComments: false
        },
        files: [{
          '<%= pkg.pubDir %>/js/tasktracker.min.js': [
            '<%= pkg.pubDir %>/src/js/tasktracker.js'
          ],
          '<%= pkg.pubDir %>/js/jquery.tasksapi.js': [
            '<%= pkg.pubDir %>/src/js/jquery.tasksapi.js'
          ]
        }]
      },
      devJQ: {
        options: {
          beautify: true,
          compress: false,
          mangle: false,
          preserveComments: 'all'
        },
        files: {
          '<%= pkg.pubDir %>/js/jquery.tasksapi.uncompressed.js': [
            '<%= pkg.pubDir %>/src/js/jquery.tasksapi.js'
          ]
        }
      },
      distJQ: {
        options: {
          compress: true,
          mangle: true,
          preserveComments: false
        },
        files: [{
          '<%= pkg.pubDir %>/js/jquery.tasksapi.js': [
            '<%= pkg.pubDir %>/src/js/jquery.tasksapi.js'
          ]
        }]
      }
    },

    watch: {
      options: {
        interrupt: true,
      },
      grunt: {
        files: ['Gruntfile.js'],
        tasks: ['build']
      },
      sass: {
        files: ['<%= pkg.pubDir %>/src/scss/**/*.scss'],
        tasks: ['sass']
      },
      scripts: {
        files: ['<%= pkg.pubDir %>/src/js/**/!(jquery)*.js'],
        tasks: ['uglify']
      },
      jquery: {
        files: ['<%= pkg.pubDir %>/src/js/**/jquery*.js'],
        tasks: ['uglify:devJQ','uglify:distJQ']
      }
    },
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-sass');

  grunt.registerTask('default', ['build', 'watch']);
  grunt.registerTask('build', ['sass', 'uglify' ]);
}
