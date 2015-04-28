# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();

use Foswiki::Plugins::JQueryPlugin;
use Foswiki::Plugins::TasksAPIPlugin::Task;
use Foswiki::Plugins::TasksAPIPlugin::Job;

use DBI;
use JSON;

our $VERSION = '0.1';
our $RELEASE = '0.1';
our $SHORTDESCRIPTION = 'Action Tracker 2.0';
our $NO_PREFS_IN_TOPIC = 1;

my $db;
my %schema_versions;
my @schema_updates = (
    [
        # Basic relations
        "CREATE TABLE meta (type TEXT NOT NULL UNIQUE, version INT NOT NULL)",
        "INSERT INTO meta (type, version) VALUES('core', 0)",
        "CREATE TABLE tasks (
            id TEXT NOT NULL UNIQUE,
            context TEXT NOT NULL,
            parent TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            form TEXT NOT NULL,
            author TEXT NOT NULL,
            created INT NOT NULL,
            due INT,
            position INT,
            raw TEXT
        )",
        "CREATE INDEX tasks_context_idx ON tasks (context)",
        "CREATE INDEX tasks_parent_idx ON tasks (parent)",
        "CREATE INDEX tasks_status_idx ON tasks (status)",
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
    [
        # Jobs
        "CREATE TABLE jobs (
            task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE ON UPDATE RESTRICT,
            job_time INT NOT NULL,
            job_type TEXT NOT NULL,
            job_done INT NOT NULL DEFAULT 0,
            parameters TEXT
        )",
        "CREATE INDEX jobs_task ON jobs (task_id)",
        "CREATE INDEX jobs_done_time ON jobs (job_done, job_time)",
    ],
);
my %singles = (
    Context => 1,
    Parent => 1,
    Status => 1,
    Author => 1,
    Created => 1,
    Due => 1,
    Position => 1,
);

sub initPlugin {
    my ( $topic, $web, $user, $installWeb ) = @_;

    # check for Plugins.pm versions
    if ( $Foswiki::Plugins::VERSION < 2.0 ) {
        Foswiki::Func::writeWarning( 'Version mismatch between ',
            __PACKAGE__, ' and Plugins.pm' );
        return 0;
    }

    Foswiki::Func::registerTagHandler( 'TASKSGRID', \&tagGrid );
    Foswiki::Func::registerTagHandler( 'TASKSSEARCH', \&tagSearch );

    Foswiki::Func::registerRESTHandler( 'create', \&restCreate );
    Foswiki::Func::registerRESTHandler( 'multicreate', \&restMultiCreate );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate );
    Foswiki::Func::registerRESTHandler( 'search', \&restSearch );
    Foswiki::Func::registerRESTHandler( 'lease', \&restLease );
    Foswiki::Func::registerRESTHandler( 'release', \&restRelease );

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
            FetchHashKeyName => 'NAME_lc',
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
    my $filterprefix = ' WHERE';
    for my $q (keys %$query) {
        next unless $q =~ /^\w+$/s;
        my $v = $query->{$q};

        if ($singles{$q}) {
            if (ref($v) eq 'ARRAY') {
                $filter .= "$filterprefix $q IN(". join(',', map { '?' } @$v) .")";
                push @args, @$v;
            } else {
                $filter .= "$filterprefix $q = ?";
                push @args, $v;
            }
            $filterprefix = ' AND';
            next;
        }

        # multi field
        my $t = "j_$q";
        $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$q')";
        if (defined $v) {
            if (ref $v eq 'ARRAY') {
                $filter .= "$filterprefix $t.value IN(". join(',', map { '?' } @$v) .")";
                push @args, @$v;
            } else {
                $filter .= "$filterprefix $t.value = ?";
                push @args, $v;
            }
            $filterprefix = ' AND';
        }
        $order = "$t.value" if $order eq $q;
    }

    $order = " ORDER BY $order" if $order && $order =~ /^[\w.]+$/;
    $order .= " DESC" if $opts{desc};
    my ($limit, $offset, $count) = ('', $opts{offset} || 0, $opts{count});
    $limit = " LIMIT $offset, $count" if $count;
    my $group = '';
    $group = ' GROUP BY t.id' if $join;
    my $ids = db()->selectall_arrayref("SELECT t.id, raw FROM tasks t$join$filter$group$order$limit", {}, @args);

    return () unless @$ids;
    my @tasks = map {
        my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $_->[0]);
        Foswiki::Plugins::TasksAPIPlugin::Task::_loadRaw($tweb, $ttopic, $_->[1])
    } @$ids;

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
    $db->do("DELETE FROM tasks WHERE id=?", {}, $task->{id}) if $transact;
    $db->do("DELETE FROM task_multi WHERE id=?", {}, $task->{id}) if $transact;
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
        if ($form->getField($f)->isMultiValued()) {
            $v = [ split(/\s*,\s*/, $v) ];
        } else {
            $v = [ $v ];
        }
        if ($singles{$f}) {
            $vals{$f} = $v->[0];
        } else {
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

sub restCreate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my %data;
    for my $k ($q->param) {
        $data{$k} = $q->param($k);
    }
    my $res = Foswiki::Plugins::TasksAPIPlugin::Task::create(%data);
    return to_json({
        status => 'ok',
        id => $res->{id},
        data => _enrich_data($res),
    });
}

sub restMultiCreate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $json = decode_json($q->param('data'));
    my @res = Foswiki::Plugins::TasksAPIPlugin::Task::createMulti(@$json);
    return to_json({
        status => 'ok',
        data => [map { _enrich_data($_) } @res],
    });
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
    my $lease = $task->{meta}->getLease();
    if ( $lease ) {
        my $cuid = $lease->{user};
        my $ccuid = $session->{user};
        
        if ( $cuid eq $ccuid ) {
            $task->{meta}->clearLease();
        }
    }

    return to_json({
        status => 'ok',
        data => _enrich_data($task),
    });
}

sub restMultiUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $req = decode_json($q->param('request'));
    my %res;
    while (my ($id, $data) = each(%$req)) {
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $id);
        $task->update(%$data);
        $res{$id} = {status => 'ok', data => _enrich_data($task)};
        $res{$id} = {status => 'error', 'code' => 'acl_change', msg => "No permission to update task"} if !$task->checkACL('change');
    }
    return to_json(\%res);
}

sub _enrich_data {
    my $task = shift;
    my $d = $task->data;
    my $fields = $d->{form}->getFields;
    my $result = {
        id => $d->{id},
        form => $d->{form}->web .'.'. $d->{form}->topic,
        attachments => [$task->{meta}->find('FILEATTACHMENT')],
        fields => {},
    };
    foreach my $f (@$fields) {
        next if $f->{name} eq 'TopicType';
        my $ff = {
            name => $f->{name},
            multi => $f->isMultiValued ? JSON::true : JSON::false,
            mapped => $f->can('isValueMapped') ? ($f->isValueMapped ? JSON::true : JSON::false) : JSON::false,
            tooltip => $f->{tooltip},
            mandatory => $f->isMandatory ? JSON::true : JSON::false,
            hidden => ($f->{attributes} =~ /H/) ? JSON::true : JSON::false,
            type => $f->{type},
            size => $f->{size},
            attributes => $f->{attributes},
            value => $d->{fields}{$f->{name}} || '',
        };
        $result->{fields}{$f->{name}} = $ff;
    }
    $result;
}

sub tagSearch {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    my $format = $params->{_format} || 'json';
    $format = lc($format);
    return "" unless $format eq 'json'; # ToDo
    delete $params->{_format};

    my @res;
    eval {
        @res = _query(%$params);
    };
    if ($@) {
        return encode_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"});
    }

    my $enrich_data = sub {};
    @res = map { _enrich_data($_) } @res;
    return encode_json({status => 'ok', data => \@res});
}

sub restSearch {
    my ($session, $subject, $verb, $response) = @_;
    my @res;
    eval {
        my $q = $session->{request};
        my $req = decode_json($q->param('request') || '{}');
        delete $req->{acl};
        @res = _query(%$req);
    };
    if ($@) {
        return encode_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"});
    }
    my $enrich_data = sub {
    };
    @res = map { _enrich_data($_) } @res;
    #return JSON->new->pretty->utf8->encode({status => 'ok', data => \@res});
    return to_json({status => 'ok', data => \@res});
}

sub restLease {
    my ( $session, $subject, $verb, $response ) = @_;
    my $q = $session->{request};
    my $r = decode_json($q->param('request') || '{}');

    unless ( $r->{web} && $r->{topic}) {
        return to_json({status => 'error', msg => "Missing web or topic parameter."});
    }

    my $meta = Foswiki::Meta->new($session, $r->{web}, $r->{topic});
    my $lease = $meta->getLease();
    if ( $lease ) {
        my $cuid = $lease->{user};
        my $ccuid = $session->{user};
        return to_json({status => 'error', msg => "Lease taken by another user"}) unless $cuid eq $ccuid;
    }

    my $ltime = $r->{leaseLength} || $Foswiki::cfg{LeaseLength} || 3600;
    $meta->setLease( $ltime );

    Foswiki::Func::setPreferencesValue('taskeditor_form', $r->{form} || 'System.TasksAPIDefaultTaskForm');

    Foswiki::Func::loadTemplate( $r->{template} || 'TasksAPI' );
    my $editor = Foswiki::Func::expandTemplate( $r->{editor} || 'tasksapi::editor' );
    $editor = Foswiki::Func::expandCommonVariables( $editor, $r->{topic}, $r->{web}, $meta );

    my @scripts = _getZone($session, $r->{web}, $r->{topic}, $meta, 'script');
    my @styles = _getZone($session, $r->{web}, $r->{topic}, $meta, 'head');

    return to_json({status => 'ok', editor => $editor, scripts => \@scripts, styles => \@styles});
}

sub _getZone {
    my ($session, $web, $topic, $meta, $zone) = @_;
    my @arr = ();

    while (my ($k, $v) = each %{$session->{_zones}->{$zone}}) {
        my $txt = Foswiki::Func::expandCommonVariables( $v->{text}, $topic, $web, $meta);
        my $reqs = $v->{requires};
        my @deps = ();
        foreach(@$reqs) {
            my $dep = $_;
            my $dtxt = Foswiki::Func::expandCommonVariables( $dep->{text}, $topic, $web, $meta);
            push(@deps, {'id', $dep->{id}, 'text', $dtxt});
        }

        push(@arr, {'id', $v->{id}, 'text', $txt, 'requires', \@deps});
    }

    return @arr
}

sub restRelease {
    my ( $session, $subject, $verb, $response ) = @_;
    my $q = $session->{request};
    my $r = decode_json($q->param('request') || '{}');

    my $meta = Foswiki::Meta->new($session, $r->{web}, $r->{topic});
    my $lease = $meta->getLease();
    if ( $lease ) {
        my $cuid = $lease->{user};
        my $ccuid = $session->{user};
        
        if ( $cuid eq $ccuid ) {
            $meta->clearLease();
            return to_json({status => 'ok'});
        }
    }

    return to_json({status => 'error', 'code' => 'server_error', msg => "Access denied"});
}

my $gridCounter = 1;
sub tagGrid {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName( $web, $topic );
    my $ctx = $params->{_DEFAULT} || $params->{context} || "$web.$topic";
    my $parent = $params->{parent} || "$web.$topic";
    my $id = $params->{id} || $gridCounter;
    $gridCounter += 1 if $id eq $gridCounter;
    my $system = $Foswiki::cfg{SystemWebName} || "System";
    my $form = $params->{form} || "$system.TasksAPIDefaultTaskForm";
    my $taskTemplate = $params->{tasktemplate} || "tasksapi::task";
    my $nestingTaskTemplate = $params->{nestingtasktemplate} || "tasksapi::task::nesting";
    my $editorTemplate = $params->{editortemplate} || "tasksapi::editor";
    my $captionTemplate = $params->{captiontemplate} || "tasksapi::caption";
    my $filterClass = $params->{filterclass} || "";
    my $captionClass = $params->{captionclass} || "";
    my $extraClass = $params->{extraclass} || "";
    my $states = $params->{states} || '%MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed,%MAKETEXT{"all"}%=all';
    my $pageSize = $params->{pagesize} || 100;
    my $query = $params->{query} || "";
    my $stateless = $params->{stateless} || 0;
    my $title = $params->{title} || '%MAKETEXT{"Tasks"}%';
    my $createText = $params->{createlinktext} || '%MAKETEXT{"Add task"}%';
    my $templateFile = $params->{templatefile} || 'TasksAPI';
    my $allowCreate = $params->{allowcreate} || 0;
    my $allowUpload = $params->{allowupload} || 0;
    my $showAttachments = $params->{showattachments} || 0;
    my $expandOnClick = $params->{expandonclick};

    $expandOnClick = 1 unless defined $expandOnClick;
    $expandOnClick = $expandOnClick =~ m/^(1|true)$/i ? 1 : 0;
    $templateFile =~ s/Template$//;

    Foswiki::Func::loadTemplate( $templateFile );
    my $editor = Foswiki::Func::expandTemplate( $editorTemplate );
    my $caption = Foswiki::Func::expandTemplate( $captionTemplate );
    my $task = Foswiki::Func::expandTemplate( $taskTemplate );
    my $taskNesting = Foswiki::Func::expandTemplate( $nestingTaskTemplate );

    my $langMacro = '%MAKETEXT{"Missing value for mandatory field"}%';
    my $translated = Foswiki::Func::expandCommonVariables( $langMacro );
    my %settings = (
        context => $ctx,
        parent => $parent,
        form => $form,
        id => $id,
        pageSize => $pageSize,
        query => $query,
        stateless => $stateless,
        template => Foswiki::urlEncode( $task ),
        nestingTemplate => Foswiki::urlEncode( $taskNesting ),
        lang => {
            missingField => Foswiki::urlEncode( $translated )
        }
    );

    my @options = ();
    foreach my $state (split(/,/, $states)) {
        my ($text, $value) = split(/=/, $state);
        $value ||= $text;
        my $option = "<option value=\"$value\">$text</option>";
        push(@options, $option);
    }

    my $statelessStyle = '';
    if ( $stateless ) {
        $statelessStyle = 'style="display: none;"';
    }

    my $allowCreateStyle = '';
    unless ( $allowCreate =~ m/^1|true$/i ) {
        $allowCreateStyle = 'style="display: none;"';
    }

    my $allowUploadStyle = '';
    unless ( $allowUpload =~ m/^1|true$/i ) {
        $allowUploadStyle = 'style="display: none;"';
    }

    my $showAttachmentsStyle = '';
    unless ( $showAttachments =~ m/^1|true$/i ) {
        $showAttachmentsStyle = 'style="display: none;"';
    }

    my $select = join('\n', @options),
    my $json = encode_json( \%settings );
    my $grid = <<GRID;
<div id="$id" class="tasktracker $extraClass" data-expand="$expandOnClick">
    <div class="filter $filterClass">
        <div>
            <div class="options">
                <span class="title">$title</span>
                <label $statelessStyle>
                    <select name="status">$select</select>
                </label>
            </div>
            <div class="create" $allowCreateStyle>
                <a href="#" class="tasks-btn tasks-btn-create">$createText</a>
            </div>
        </div>
    </div>
    <div class="caption $captionClass">
        <div class="container"><div>$caption</div></div>
    </div>
    <div class="tasks">
        <div></div>
    </div>
    <div class="settings">$json</div>
    <div id="task-editor-$id" class="jqUIDialog task-editor">
        <div></div>
        <div $showAttachmentsStyle>
            %TWISTY{showlink="%MAKETEXT{"Show attachments"}%" hidelink="%MAKETEXT{"Hide attachments"}%" start="hide"}%
            %ENDTWISTY%
        </div>
        <div $allowUploadStyle>
            %TWISTY{showlink="%MAKETEXT{"Attach file(s)"}%" hidelink="%MAKETEXT{"Hide"}%" start="hide"}%
            %DNDUPLOAD{extraclass="full-width" tasksgrid="1"}%
            %ENDTWISTY%
        </div>
        <div>
            <a href="#" class="tasks-btn tasks-btn-save">%MAKETEXT{"Save"}%</a>
            <a href="#" class="tasks-btn tasks-btn-cancel">%MAKETEXT{"Cancel"}%</a>
        </div>
    </div>
    <a class="task-subbtn-template task-child-add tasks-btn tasks-btn-create" href="#">%MAKETEXT{"Add sub-task"}%</a>
</div>
GRID

    my @jqdeps = ("blockui", "jqp::moment", "jqp::observe", "jqp::underscore", "tasksapi", "ui::accordion", "ui::dialog");
    foreach (@jqdeps) {
        Foswiki::Plugins::JQueryPlugin::createPlugin( $_ );
    }

    my $pluginURL = '%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin';
    my $debug = $Foswiki::cfg{TasksAPIPlugin}{Debug} || 0;
    my $suffix = $debug ? '' : '.min';
    Foswiki::Func::addToZone( 'script', 'TASKSAPI::SCRIPTS', <<SCRIPT, 'JQUERYPLUGIN::JQP::UNDERSCORE' );
<script type="text/javascript" src="$pluginURL/js/tasktracker$suffix.js"></script>
SCRIPT

    Foswiki::Func::addToZone( 'head', 'TASKSAPI::STYLES', <<STYLE );
<link rel='stylesheet' type='text/css' media='all' href='$pluginURL/css/tasktracker$suffix.css' />
STYLE

    return $grid;
}

# Refresh task metadata after uploading attachments
sub afterUploadHandler {
    my ($attachment, $meta) = @_;
    my $task;
    eval {
        $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($meta);
    };
    return if ($@);
    _index($task);
}

# Special handler that prevents certain pages from being rendered in the tasks
# web, to prevent the server from melting
sub beforeCommonTagsHandler {
    my ($text, $topic, $web, $meta) = @_;
    return unless $web eq $Foswiki::cfg{TasksAPIPlugin}{DBWeb};
    return unless $Foswiki::Plugins::SESSION->inContext('body_text');
    if (grep /^\Q$topic\E$/, qw(WebAtom WebRss WebNotify WebTopicList WebIndex WebChanges WebShortIndex WebSearch WebSearchAdvanced)) {
        $_[0] = 'Disabled for performance reasons in this web.';
        return;
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
