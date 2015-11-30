# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin::Job;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Form ();

use Date::Manip;
use JSON;

*_db = \&Foswiki::Plugins::TasksAPIPlugin::db;

sub create {
    my %params = @_;
    my $db = _db();
    my ($tid, $time, $type) = delete @params{'task_id', 'time', 'type'};
    if (my $task = delete $params{task}) {
        $tid = $task->id;
    }
    if (ref $time && $time->isa('Date::Manip::Delta')) {
        my $date = new Date::Manip::Date;
        $date->parse('now');
        $date->calc($time);
        $time = $date->printf('%s');
    } elsif (ref $time && $time->isa('Date::Manip::Date')) {
        $time = $time->printf('%s');
    }
    $db->do("INSERT INTO jobs (task_id, job_time, job_type, parameters) VALUES(?,?,?,?)", {}, $tid, $time, $type, encode_json(\%params));
}

sub remove {
    my %params = @_;
    my $db = _db();
    my ($tid, $type) = delete @params{'task_id', 'type'};
    if (my $task = delete $params{task}) {
        $tid = $task->id;
    }
    $db->do("DELETE FROM jobs WHERE task_id=? AND job_type=?", {}, $tid, $type);
}

sub process {
    my $db = _db();
    my $sth = $db->prepare("SELECT j.rowid, * FROM jobs j JOIN tasks t ON (j.task_id = t.id) WHERE job_done=0 AND job_time <= ?");
    $sth->execute(scalar time);
    while (my $job = $sth->fetchrow_hashref) {
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::_loadRaw(Foswiki::Func::normalizeWebTopicName(undef, $job->{task_id}), $job->{raw});
        my $type = $job->{job_type};
        my $params = decode_json($job->{parameters});

        my $mark_done = sub {
            $db->do("UPDATE jobs SET job_done=1 WHERE rowid=?", {}, $job->{rowid});
        };

        if ($type eq 'reopen') {
            next unless $task->{fields}{Status} eq 'closed';
            print STDERR "Reopen task: $task->{id}\n";
            $task->update(Status => 'open');
            $mark_done->();
            next;
        }
        if ($type eq 'remind') {
            next unless $task->{fields}{Status} eq 'open';
            print STDERR "Remind task: $task->{id}\n";
            $task->notify('remind');
            my $remind = $task->getPref('SCHEDULE_REMIND');
            if ($remind) {
                my $date = new Date::Manip::Date();
                $date->parse($remind);
                $db->do("UPDATE jobs SET job_time=? WHERE rowid=?", $date, $job->{rowid});
            }
        }
    }
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


