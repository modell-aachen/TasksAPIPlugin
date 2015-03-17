# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Contrib::JsonRpcContrib ();

use Foswiki::Plugins::TasksAPIPlugin::Task;

use DBI;
use JSON;

our $VERSION = '0.1';
our $RELEASE = '0.1';
our $SHORTDESCRIPTION = 'Empty Plugin used as a template for new Plugins';
our $NO_PREFS_IN_TOPIC = 1;

my $db;
my %schema_versions;
my @schema_updates = (
    [
        "CREATE TABLE meta (type TEXT NOT NULL UNIQUE, version INT NOT NULL)",
        "INSERT INTO meta (type, version) VALUES('core', 0)",
        "CREATE TABLE tasks (
            id TEXT NOT NULL UNIQUE,
            context TEXT NOT NULL,
            parent TEXT,
            state TEXT NOT NULL DEFAULT 'open',
            form TEXT NOT NULL,
            author TEXT NOT NULL,
            created INTEGER NOT NULL,
            due INTEGER,
            raw TEXT
        )",
        "CREATE INDEX tasks_context_idx ON tasks (context)",
        "CREATE INDEX tasks_parent_idx ON tasks (parent)",
        "CREATE INDEX tasks_state_idx ON tasks (state)",
        "CREATE INDEX tasks_form_idx ON tasks (form)",
        "CREATE INDEX tasks_author_idx ON tasks (author)",
        "CREATE INDEX tasks_created_idx ON tasks (created)",
        "CREATE INDEX tasks_due_idx ON tasks (due)",
        "CREATE TABLE task_multi (
            id TEXT NOT NULL,
            type TEXT NOT NULL,
            value TEXT NOT NULL
        )",
        "CREATE INDEX task_multi_id_idx ON task_multi (id, type, value)",
        "CREATE INDEX task_type_idx ON task_multi (type, value)"
    ],
);
my %singles = (
    context => 1,
    parent => 1,
    state => 1,
    author => 1,
    created => 1,
    due => 1,
);
my @multis = qw(assignedto informees);

sub initPlugin {
    my ( $topic, $web, $user, $installWeb ) = @_;

    # check for Plugins.pm versions
    if ( $Foswiki::Plugins::VERSION < 2.0 ) {
        Foswiki::Func::writeWarning( 'Version mismatch between ',
            __PACKAGE__, ' and Plugins.pm' );
        return 0;
    }

#    Foswiki::Func::registerTagHandler( 'EXAMPLETAG', \&_EXAMPLETAG );
    Foswiki::Func::registerRESTHandler( 'create', \&restCreate );
    Foswiki::Func::registerRESTHandler( 'multicreate', \&restMultiCreate );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate );
    Foswiki::Func::registerRESTHandler( 'search', \&restSearch );

    # Plugin correctly initialized
    return 1;
}

sub finishPlugin {
    undef $db;
    undef %schema_versions;
}

sub db {
    return $db if defined $db;
    $db = DBI->connect("DBI:SQLite:dbname=$Foswiki::cfg{DataDir}/$Foswiki::cfg{TasksAPIPlugin}{DBWeb}/tasks.db",
        '', # user
        '', # pwd
        {
            RaiseError => 1,
            PrintError => 0,
            AutoCommit => 1,
        }
    );
    eval {
        %schema_versions = %{ $db->selectall_hashref("SELECT * FROM meta", 'type') };
    };
    _applySchema('core', @schema_updates);
    $db;
}
sub _applySchema {
    my $type = shift;
    if (!$schema_versions{$type}) {
        $schema_versions{$type} = { version => 0 };
    }
    my $v = $schema_versions{$type}{version};
    return if $v >= @_;
    for my $schema (@_[$v..$#_]) {
        $db->begin_work;
        for my $s (@$schema) {
            if (ref($s) eq 'CODE') {
                $s->($db);
            } else {
                $db->do($s);
            }
        }
        $db->do("UPDATE meta SET version=? WHERE type=?", {}, ++$v, $type);
        $db->commit;
    }
}


sub _query {
    my %opts = @_;
    my $useACL = $opts{acl};
    $useACL = 1 unless defined $useACL;

    my $query = $opts{query} || {};
    my $join = '';
    my $filter = '';
    my $order = $opts{order} || '';
    my @args;
    for my $multi (@multis) {
        next unless exists $query->{$multi};
        my $v = delete $query->{$multi};
        my $t = "j_$multi";
        $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$multi')";
        if (defined $v) {
            if (ref $v eq 'ARRAY') {
                $filter .= " WHERE $t.value IN(". join(',', map { '?' } @$v) .")";
                push @args, @$v;
            } else {
                $filter .= " WHERE $t.value = ?";
                push @args, $v;
            }
        }
        $order = $t if $order eq $multi;
    }
    for my $col (keys %$query) {
        next unless $col =~ /^\w+$/s;
        my $v = $query->{$col};
        if (ref $v eq 'ARRAY') {
            $filter .= " WHERE $col IN(". join(',', map { '?' } @$v) .")";
            push @args, @$v;
        } else {
            $filter .= "WHERE $col = ?";
            push @args, $v;
        }
    }
    $order = " ORDER BY $order" if $order;
    $order .= " DESC" if $opts{desc};
    my ($limit, $offset, $count) = ('', $opts{offset} || 0, $opts{count});
    $limit = " LIMIT $offset, $count" if $count;
    my $group = '';
    $group = ' GROUP BY t.id' if $join;
    my $ids = db()->selectall_arrayref("SELECT t.id, raw FROM tasks t$join$filter$group$order$limit", {}, @args);

    return () unless @$ids;
    my @tasks = map { Foswiki::Plugins::TasksAPIPlugin::Task::_loadRaw($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, "Task-$_->[0]", $_->[1]) } @$ids;

    return @tasks unless $useACL;
    grep {
        $_->checkACL('view')
    } @tasks;
}

sub _index {
    my $task = shift;
    my $transact = shift;
    $transact = 1 unless defined $transact;
    my $db = db();
    $db->begin_work if $transact;
    $db->do("DELETE FROM tasks WHERE id=?", {}, $task->{id});
    $db->do("DELETE FROM task_multi WHERE id=?", {}, $task->{id});
    my $form = $task->{form};
    my %vals = (
        id => $task->{id},
        form => $form->web .'.'. $form->topic,
        raw => $task->{meta}->getEmbeddedStoreForm,
    );
    my @extra;
    for my $f (keys %{$task->{fields}}) {
        my $v = $task->{fields}{$f};
        next unless defined $v;
        if ($singles{lc $f}) {
            $vals{$f} = $v;
        } elsif (grep { $_ eq lc $f } @multis) {
            push @extra, map { { type => $f, value => $_ } } @$v;
        }
    }
    my @keys = keys %vals;
    $db->do("INSERT INTO tasks (". join(',', @keys) .") VALUES(". join(',', map {'?'} @keys) .")", {}, @vals{@keys});
    foreach my $e (@extra) {
        $db->do("INSERT INTO task_multi (id, type, value) VALUES(?, ?, ?)", {}, $task->{id}, $e->{type}, $e->{value});
    }
    $db->commit if $transact;
}
sub _fullindex {
    my $db = db();
    $db->begin_work;
    $db->do("DELETE FROM tasks");
    $db->do("DELETE FROM task_multi");
    foreach my $t (Foswiki::Plugins::TasksAPIPlugin::Task::loadMany()) {
        print $t->{id} ."\n";
        _index($t, 0);
    }
    $db->commit;
}

# The function used to handle the %EXAMPLETAG{...}% macro
# You would have one of these for each macro you want to process.
#sub _EXAMPLETAG {
#    my($session, $params, $topic, $web, $topicObject) = @_;
#}

#sub beforeSaveHandler {
#    my ( $text, $topic, $web ) = @_;
#}

#sub afterSaveHandler {
#    my ( $text, $topic, $web, $error, $meta ) = @_;
#}

#sub afterRenameHandler {
#    my ( $oldWeb, $oldTopic, $oldAttachment,
#         $newWeb, $newTopic, $newAttachment ) = @_;
#}

#sub restExample {
#   my ( $session, $subject, $verb, $response ) = @_;
#   return "This is an example of a REST invocation\n\n";
#}

sub restCreate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my %data;
    for my $k ($q->param) {
        $data{$k} = $q->param($k);
    }
    my $res = Foswiki::Plugins::TasksAPIPlugin::Task::create(%data);
    return encode_json({
        status => 'ok',
        id => $res->{id},
    });
}

sub restMultiCreate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $json = decode_json($q->param('data'));
    my $res = Foswiki::Plugins::TasksAPIPlugin::Task::createMulti(@$json);
    return '{"status":"ok"}';
}


sub restUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my %data;
    for my $k ($q->param) {
        $data{$k} = $q->param($k);
    }
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, delete $data{id});
    unless ($task->checkACL('change')) {
        return '{"status":"error","code":"acl_change","msg":"No permission to update task"}';
    }

    $task->update(%data);
    return '{"status":"ok"}';
}

sub restMultiUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $req = decode_json($q->param('request'));
    my %res;
    while (my ($id, $data) = each(%$req)) {
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $id);
        $task->update(%$data);
        $res{$id} = {status => 'ok'};
        $res{$id} = {status => 'error', 'code' => 'acl_change', msg => "No permission to update task"} if !$task->checkACL('change');
    }
    return encode_json(\%res);
}

sub restSearch {
    my ($session, $subject, $verb, $response) = @_;
    my @res;
    eval {
        my $q = $session->{request};
        my $req = decode_json($q->param('request'));
        @res = _query(%$req);
    };
    if ($@) {
        return encode_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"});
    }
    @res = map { $_->data } @res;
    return encode_json({status => 'ok', data => \@res});
}

1;

__END__
Q.Wiki Tasks API - Modell Aachen GmbH

Author: %$AUTHOR%

Copyright (C) 2014 Modell Aachen GmbH

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version. For
more details read LICENSE in the root of this distribution.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

As per the GPL, removal of this notice is prohibited.
