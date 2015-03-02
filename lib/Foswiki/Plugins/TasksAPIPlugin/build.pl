#!/usr/bin/perl -w
# Standard preamble
use strict;
BEGIN { unshift @INC, split( /:/, $ENV{FOSWIKI_LIBS} ); }
use Foswiki::Contrib::Build;

sub target_build {
  my $this = shift;
  $this->_installDeps();
}

sub _installDeps {
  my $this = shift;

  local $| = 1;
  print "Fetching node dependencies:\n";
  print $this->sys_action( qw(npm install) ) . "\n";
  print "Done!\n\n";

  print "Fetching bower dependencies:\n";
  print $this->sys_action( qw(bower update) ) . "\n";
  print "Done!\n\n";

  print "Building...\n";
  print $this->sys_action( qw(grunt build) ) . "\n";
  print "Done!\n\n";
}

my $build = Foswiki::Contrib::Build->new('TasksAPIPlugin');
$build->build( $build->{target} );

