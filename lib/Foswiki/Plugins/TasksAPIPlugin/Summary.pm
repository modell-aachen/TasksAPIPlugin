# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin::Summary;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Form ();


use Date::Manip;
use Getopt::Long;
use JSON;

my %cfg = (
    asc         => 0,
    duefield    => 'DueDate',
    fields      => '',
    help        => 0,
    hours       => 24,
    lang        => 'en',
    order       => 'DueDate',
    status      => 'open'
);

Getopt::Long::GetOptions(
    'asc|a'           => \$cfg{asc},
    'duefield|d=s'    => \$cfg{duefield},
    'fields|f=s'      => \$cfg{fields},
    'help'            => \$cfg{help},
    'hours|h=i'       => \$cfg{hours},
    'lang|l=s'        => \$cfg{lang},
    'order|o=s'       => \$cfg{order},
    'status|s=s'      => \$cfg{status},
) or die("Error in command line arguments\n");

if ($cfg{help} || $cfg{fields} =~ /^\s*$/) {
    print STDERR "ToDo: show help...\n";
    # ToDo.
    exit 0;
}

sub process {
    $cfg{fields} =~ s/\s*//g;
    my @fields = split(/,/, $cfg{fields});
    $cfg{status} =~ s/\s*//g;
    my @status = split(/,/, $cfg{status});

    # Set Language
    my $language = Foswiki::Func::expandCommonVariables($cfg{lang});
    Foswiki::Func::setPreferencesValue( 'LANGUAGE', $language );
    # Copy/Paste from MailerContrib:
    if ( $Foswiki::Plugins::SESSION->can('reset_i18n') ) {
        $Foswiki::Plugins::SESSION->reset_i18n();
    } elsif ( $Foswiki::Plugins::SESSION->{i18n} ) {
        # Muddy boots.
        $Foswiki::Plugins::SESSION->i18n->finish();
        undef $Foswiki::Plugins::SESSION->{i18n};
    }

    my %hash = ();
    my %unique = ();
    foreach my $field (@fields) {
        my $from = $field eq $cfg{duefield}
            ? 0
            : ($cfg{hours} ? time - ($cfg{hours}*60*60) : 0);
        my %filter = (
            type => 'range',
            from => $from,
            to => time
        );

        my %query = (Status => \@status);
        $query{$field} = \%filter;

        my $res = Foswiki::Plugins::TasksAPIPlugin::query(
            query => \%query,
            order => $cfg{order},
            desc => $cfg{asc} ? 0 : 1,
            count => -1
        );

        next unless $res->{total};
        foreach my $task (@{$res->{tasks}}) {
            my @usrFields = map {$_->{name}} grep {$_->{type} =~ /^user/i} @{$task->{form}->getFields()};
            push(@usrFields, 'Author');

            foreach my $f (@usrFields) {
                my $usr = $task->{fields}{$f};
                next unless $usr;
                next if $usr eq 'Team' && $field ne $cfg{duefield};

                $usr =~ s/\s*//g;
                my @informees = map {Foswiki::Func::getWikiName($_)} split(/,/, $usr);
                @{$task->{informees}}{@informees} = @informees;
                @{$unique{user}}{@informees} = @informees;
            }

            push(@{$hash{$field}}, $task);
        }
    }

    Foswiki::Func::loadTemplate('TasksAPISummaryMail');
    Foswiki::Func::setPreferencesValue('TASKSAPI_SUMMARY_TIMESPAN', $cfg{hours});

    require Foswiki::Contrib::MailTemplatesContrib;
    foreach my $user (keys %{$unique{user}}) {
        my @body;
        while (my ($field, $tasks) = each %hash) {
            my @rows;
            my $title = Foswiki::Func::expandTemplate('tasksapi::summary::title::'.lc($field));
            $title = Foswiki::Func::expandCommonVariables($title);
            Foswiki::Func::setPreferencesValue('TASKSAPI_SUMMARY_TITLE', $title);

            foreach my $task (@$tasks) {
                next unless $task->{informees}{$user};

                my $txt = Foswiki::Plugins::TasksAPIPlugin::withCurrentTask($task, sub {
                    $task->{meta}->expandMacros(Foswiki::Func::expandTemplate('tasksapi::summary::task'));
                });

                push(@rows, $txt);
            }

            Foswiki::Func::setPreferencesValue('TASKSAPI_SUMMARY_TASKS', join('', @rows));
            my $table = Foswiki::Func::expandTemplate('tasksapi::summary::table');
            $table = Foswiki::Func::expandCommonVariables($table);
            push(@body, $table);
        }

        Foswiki::Func::setPreferencesValue('TASKSAPI_MAIL_TO', $user);
        Foswiki::Func::setPreferencesValue('TASKSAPI_SUMMARY_CONTENTS', join('', @body));
        Foswiki::Contrib::MailTemplatesContrib::sendMail('TasksAPISummaryMail');
    }

    exit 0;
}

1;

__END__
Q.Wiki Tasks API - Modell Aachen GmbH

Author: %$AUTHOR%

Copyright (C) 2014-2015 Modell Aachen GmbH

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version. For
more details read LICENSE in the root of this distribution.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

As per the GPL, removal of this notice is prohibited.
