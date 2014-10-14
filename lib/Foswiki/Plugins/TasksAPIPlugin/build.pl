#!/usr/bin/perl -w
# Standard preamble
use strict;
BEGIN { unshift @INC, split( /:/, $ENV{FOSWIKI_LIBS} ); }
use Foswiki::Contrib::Build;

my $build = Foswiki::Contrib::Build->new('TasksAPIPlugin');
$build->build( $build->{target} );

