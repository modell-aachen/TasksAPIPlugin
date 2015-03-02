#!/usr/bin/perl -w
# Standard preamble
use strict;
BEGIN { unshift @INC, split( /:/, $ENV{FOSWIKI_LIBS} ); }
use Foswiki::Contrib::Build;

package TasksAPIPluginBuild;
our @ISA = qw(Foswiki::Contrib::Build);

sub new {
  my $class = shift;
  return bless( $class->SUPER::new( "TasksAPIPlugin" ), $class );
}

sub target_build {
  my $this = shift;
  $this->_installDeps();
}

sub target_compress {}

sub _installDeps {
  my $this = shift;

  local $| = 1;
  print "Fetching node dependencies:\n";
  print $this->sys_action( qw(npm install) );
  print "\nDone!\n\n";

  print "Fetching bower dependencies:\n";
  print $this->sys_action( qw(bower update) );
  print "\nDone!\n\n";

  print "Building...\n";
  print $this->sys_action( qw(grunt build) );
  print "\nDone!\n\n";
}

my $build = TasksAPIPluginBuild->new('TasksAPIPlugin');
$build->build( $build->{target} );

