# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Time ();

use Foswiki::Plugins::JQueryPlugin;
use Foswiki::Plugins::TasksAPIPlugin::Task;
use Foswiki::Plugins::TasksAPIPlugin::Job;

use DBI;
use Encode;
use JSON;
use Number::Bytes::Human qw(format_bytes);

our $VERSION = '0.1';
our $RELEASE = '0.1';
our $SHORTDESCRIPTION = 'API and frontend for managing assignable tasks';
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
    id => 1,
    Context => 1,
    Parent => 1,
    Status => 1,
    Author => 1,
    Created => 1,
    Due => 1,
    Position => 1,
);

my $gridCounter = 1;
my $renderRecurse = 0;
our $currentTask;
our $currentOptions;
our $currentExpands;

my $aclCache = {};
my $caclCache = {};

sub initPlugin {
    my ( $topic, $web, $user, $installWeb ) = @_;

    # check for Plugins.pm versions
    if ( $Foswiki::Plugins::VERSION < 2.0 ) {
        Foswiki::Func::writeWarning( 'Version mismatch between ',
            __PACKAGE__, ' and Plugins.pm' );
        return 0;
    }

    Foswiki::Func::registerTagHandler( 'TASKSAMPEL', \&tagAmpel );
    Foswiki::Func::registerTagHandler( 'TASKSGRID', \&tagGrid );
    Foswiki::Func::registerTagHandler( 'TASKSSEARCH', \&tagSearch );
    Foswiki::Func::registerTagHandler( 'TASKINFO', \&tagInfo );

    my %attachopts = (authenticate => 1, validate => 0, http_allow => 'POST');
    Foswiki::Func::registerRESTHandler( 'attach', \&restAttach, %attachopts );

    Foswiki::Func::registerRESTHandler( 'create', \&restCreate );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate );
    Foswiki::Func::registerRESTHandler( 'search', \&restSearch );
    Foswiki::Func::registerRESTHandler( 'lease', \&restLease );
    Foswiki::Func::registerRESTHandler( 'release', \&restRelease );

    return 1;
}

sub finishPlugin {
    undef $db;
    undef %schema_versions;
    $aclCache = {};
    $caclCache = {};
    $gridCounter = 1;
    $renderRecurse = 0;
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
    $db->{sqlite_unicode} = 0;
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

=begin TML

---++ StaticMethod withCurrentTask( $task, $code )

Executes the code in =$code= while setting =$task= as the current task, i.e.
the task used by default in the TASKINFO macro.

=cut

sub withCurrentTask {
    local $currentTask = shift;
    my $sub = shift;
    my $res = $sub->(@_);
    $res;
}

=begin TML

---++ StaticMethod query( %opts ) -> @tasks

Queries the database for tasks. =%opts= may contain the following keys:

   * =query=: a hash that is matched against tasks, i.e. each key in the hash
     corresponds to a field in tasks, and only tasks having the corresponding
     value (or one of the corresponding values, if the hash value is an array
     ref) will be returned.
   * =acl=: 0 to return tasks without checking permissions. Defaults to 1.
   * =order=: sort results by this field
   * =desc=: 1 to sort in descending order
   * =offset=: skip this many results
   * =count=: return at most this many results

Returns a list of matching task objects.

=cut

sub query {
    my %opts = @_;
    my $useACL = $opts{acl};
    $useACL = 1 unless defined $useACL;

    my $query = $opts{query} || {};
    my $join = '';
    my $filter = '';
    my $order = $opts{order} || '';
    my @args;
    my $filterprefix = ' WHERE';
    my %joins;
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
        $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$q')" unless $joins{$q};
        $joins{$q} = 1;
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

    if ($order && !$singles{$order} && !$joins{$order}) {
        my $t = "j_$order";
        $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$order')";
        $order = "$t.value";
    }
    $order = " ORDER BY $order" if $order && $order =~ /^[\w.]+$/;
    $order .= " DESC" if $order && $opts{desc};

    my ($limit, $offset, $count) = ('', $opts{offset} || 0, $opts{count});
    $limit = " LIMIT $offset, $count" if $count;
    my $group = '';
    $group = ' GROUP BY t.id' if $join;
    my $ids = db()->selectall_arrayref("SELECT t.id, raw FROM tasks t$join$filter$group$order$limit", {}, @args);
    my $total = db()->selectrow_array("SELECT count(*) FROM tasks t$join$filter", {}, @args);

    return {} unless @$ids;
    my @tasks = map {
        my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $_->[0]);
        Foswiki::Plugins::TasksAPIPlugin::Task::_loadRaw($tweb, $ttopic, $_->[1])
    } @$ids;

    my $ret = {tasks => \@tasks, total => $total};
    return $ret unless $useACL;
    @tasks = grep {
        $_->checkACL('view')
    } @tasks;

    $ret->{tasks} = \@tasks;
    $ret;
}
*_query = \&query; # Backwards compatibility

# Create/update the task entry in the database
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
        Parent => '',
        # Convert to Unicode as a workaround for bad constellation of perl/DBD::SQLite versions
        raw => Encode::decode($Foswiki::cfg{Site}{CharSet}, $task->{meta}->getEmbeddedStoreForm),
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
# Bring the entire database up-to-date
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

sub _cachedACL {
    my $acl = shift;
    $aclCache->{$acl};
}
sub _cacheACL {
    $aclCache->{$_[0]} = $_[1];
}
sub _cachedContextACL {
    my $acl = shift;
    $caclCache->{$acl};
}
sub _cacheContextACL {
    $caclCache->{$_[0]} = $_[1];
}

sub restAttach {
    my ( $session, $subject, $verb, $response ) = @_;
    my $q = Foswiki::Func::getCgiQuery();

    my $name = $q->param('filename');
    my $path = $q->param('filepath');

    my $id = $q->param('id') || '';
    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, "$id");
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    unless ($task->checkACL('change')) {
        $response->header(-status => 403);
        return to_json({
            status => 'error',
            code => 'acl_change',
            msg => 'No permission to attach files to this task'
        });
    }

    eval {
        my $q = Foswiki::Func::getCgiQuery();
        my $stream = $q->upload('filepath');
        unless ($stream) {
            $response->header(-status => 405);
            return to_json({
                status => 'error',
                code => 'server_error',
                msg => 'Attachment has zero size'
            });
        }

        my @stats = stat $stream;
        my $origName = $name;
        ($name, $origName) = Foswiki::Sandbox::sanitizeAttachmentName($name);
        $task->{meta}->attach(
            filedate => $stats[9],
            filepath => $path,
            filesize => $stats[7],
            name => $name,
            nohandlers => 1,
            stream => $stream
        );

        close($stream);
    };
    if ($@) {
        Foswiki::Func::writeWarning( $@ );
        $response->header(-status => 500);
        return to_json({
            status => 'error',
            'code' => 'server_error',
            msg => "Server error: $@"
        });
    }

    my ($date, $user, $rev, $comment) = Foswiki::Func::getRevisionInfo($web, $topic, 0, $name);
    return to_json({
        status => 'ok',
        filedate => $date,
        filerev => $rev
    });
}

sub restCreate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my %data;
    my $depth = $q->param('_depth') || 0;
    for my $k ($q->param) {
        $data{$k} = $q->param($k);
    }
    my $res = Foswiki::Plugins::TasksAPIPlugin::Task::create(%data);
    $res->{_depth} = $depth;

    if ( $q->param('templatefile') ) {
        Foswiki::Func::loadTemplate( $q->param('templatefile') );
    }

    return to_json({
        status => 'ok',
        id => $res->{id},
        data => _enrich_data($res, $q->param('tasktemplate') || $res->getPref('TASK_TEMPLATE') || 'tasksapi::task'),
    });
}

sub restUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $depth = $q->param('_depth');
    my $order = $q->param('_order');
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

    if ( $q->param('templatefile') ) {
        Foswiki::Func::loadTemplate( $q->param('templatefile') );
    }
    _deepen([$task], $depth, $order);

    return to_json({
        status => 'ok',
        data => _enrich_data($task, $q->param('tasktemplate') || $task->getPref('TASK_TEMPLATE') || 'tasksapi::task'),
    });
}

sub restMultiUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my $req = from_json($q->param('request'));
    my %res;
    while (my ($id, $data) = each(%$req)) {
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $id);
        unless ($task->checkACL('change')) {
            $res{$id} = {status => 'error', 'code' => 'acl_change', msg => "No permission to update task"};
            next;
        }
        $task->update(%$data);
        $res{$id} = {status => 'ok', data => _enrich_data($task, $q->param('tasktemplate'), $q->param('templatefile'))};
    }
    return to_json(\%res);
}

# Translate stuff without having to worry about escaping
sub _translate {
    my ($meta, $text) = @_;
    $text =~ s#(\\+)#$1\\#g;
    $text =~ s#(?<!\\)"#\\"#g;
    $text =~ s#\$#\$dollar#g;
    $text =~ s#%#\$percnt#g;
    $meta->expandMacros("%MAKETEXT{\"$text\"}%");
};

# Given a task object, returns a structure suitable for serializing to JSON
# that contains all the information we need
sub _enrich_data {
    my $task = shift;
    my $tpl = shift || 'tasksapi::task';

    my $d = $task->data;
    my $fields = $d->{form}->getFields;
    my $result = {
        id => $d->{id},
        depth => $task->{_depth},
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
            tooltip => _translate($task->{meta}, $f->{tooltip}),
            mandatory => $f->isMandatory ? JSON::true : JSON::false,
            hidden => ($f->{attributes} =~ /H/) ? JSON::true : JSON::false,
            type => $f->{type},
            size => $f->{size},
            attributes => $f->{attributes},
            value => $d->{fields}{$f->{name}} || '',
        };
        $result->{fields}{$f->{name}} = $ff;
    }

    foreach my $a (@{$result->{attachments}}) {
        next if ref($a->{user});

        $a->{user} = {
            cuid => $a->{user},
            wikiusername => Foswiki::Func::getWikiUserName($a->{user}),
            wikiname => Foswiki::Func::getWikiName($a->{user}),
            loginname => Foswiki::Func::wikiToUserName($a->{user})
        };

        $a->{date} = {
            epoch => $a->{date},
            gmt => Foswiki::Time::formatTime($a->{date})
        };

        $a->{size} = {
            bytes => $a->{size},
            human => format_bytes($a->{size})
        };

        my $pub = $Foswiki::cfg{PubUrlPath} || '/pub';
        my ($web, $topic) = split(/\./, $d->{id});
        $a->{link} = "$pub/$web/$topic/" . $a->{name};
    }

    $result->{html} = _renderTask($task->{meta}, $tpl, $task);

    $result;
}

sub tagAmpel {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    my $title = '%MAKETEXT{"Unknown status"}%';
    my $date = $params->{_DEFAULT} || $params->{date};
    my $status = $params->{status} || 'open';
    my $warn = $params->{warn} || 3;

    return "<img src=\"%PUBURL%/%SYSTEMWEB%/TasksAPIPlugin/assets/ampel.png\" alt=\"\" title=\"$title\">" if ( !$date && $status eq 'open' );

    my $src = '';
    if ( $status eq 'open' ) {
        my $now = scalar time();
        my $secs = $date;
        $secs = Foswiki::Time::parseTime($date) unless $secs =~ /^\d+$/;
        my $offset = $warn * 24 * 60 * 60;
        my $state = 'g';
        $state = 'o' if $now  + $offset > $secs;
        $state = 'r' if $now >= $secs;
        $src = "ampel_$state";

        my $delta = int(($secs - $now)/86400);
        my $abs = abs($delta);
        $title = '%MAKETEXT{"In one day"}%' if $delta eq 1;
        $title = "%MAKETEXT{\"In [_1] days\" args=\"$delta\"}%" if $delta > 1;
        $title = '%MAKETEXT{"One day over due"}%' if $delta eq -1;
        $title = "%MAKETEXT{\"[_1] days over due\" args=\"$abs\"}%" if $delta < -1;
    } else {
        $src = $status eq 'closed' ? 'closed' : 'deleted';
    }

    my $img = <<IMG;
<img src="%PUBURL%/%SYSTEMWEB%/TasksAPIPlugin/assets/$src.png" alt="" title="$title">
IMG

    return $img;
}

sub tagSearch {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    my $res;
    delete $params->{_RAW};
    eval {
        $res = _query(query => { %$params });
    };
    if ($@) {
        return to_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"});
    }

    if ( $params->{templatefile}) {
        Foswiki::Func::loadTemplate( $params->{templatefile} );
    }

    my @res = map { _enrich_data($_, $params->{tasktemplate}) } @{$res->{tasks}};
    return to_json({status => 'ok', data => \@res});
}

sub restSearch {
    my ($session, $subject, $verb, $response) = @_;
    my $res;
    my $req;
    my $q = $session->{request};

    eval {
        $req = from_json($q->param('request') || '{}');
        delete $req->{acl};
        $res = _query(%$req);
    };
    if ($@) {
        return to_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"});
    }

    my $depth = $req->{depth} || 0;
    _deepen($res->{tasks}, $depth, $req->{order});
    my $file = $req->{templatefile} || 'TasksAPI';
    Foswiki::Func::loadTemplate( $file );

    my @tasks = map { _enrich_data($_, $req->{tasktemplate} || $_->getPref('TASK_TEMPLATE') || 'tasksapi::task') } @{$res->{tasks}};
    return to_json({status => 'ok', data => \@tasks});
}

sub restLease {
    my ( $session, $subject, $verb, $response ) = @_;
    my $q = $session->{request};
    my $r = from_json($q->param('request') || '{}');

    my $meta;
    my $edtpl;
    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $r->{Context});

    if ($r->{id}) {
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load(Foswiki::Func::normalizeWebTopicName(undef, $r->{id}));
        my $lease = $task->{meta}->getLease();
        if ( $lease ) {
            if ( $lease->{expires} < time ) {
                $task->{meta}->clearLease();
            } else {
                my $cuid = $lease->{user};
                my $ccuid = $session->{user};
                return to_json({status => 'error', code=> 'lease_taken', msg => "Lease taken by another user"}) unless $cuid eq $ccuid;
            }
        }

        my $ltime = $r->{leaseLength} || $Foswiki::cfg{LeaseLength} || 3600;
        $task->{meta}->setLease( $ltime );
        $meta = $task->{meta};
        $edtpl = $task->getPref('EDITOR_TEMPLATE');

        Foswiki::Func::setPreferencesValue('taskeditor_form', $task->{form}->web .'.'. $task->{form}->topic);
        Foswiki::Func::setPreferencesValue('taskeditor_isnew', '0');
        Foswiki::Func::setPreferencesValue('taskeditor_taskid', $r->{id});
    } else {
        $meta = Foswiki::Meta->new($session, $web, $topic);
        my $f = $r->{form} || 'System.TasksAPIDefaultTaskForm';
        Foswiki::Func::setPreferencesValue('taskeditor_form', $f);
        Foswiki::Func::setPreferencesValue('taskeditor_isnew', '1');

        if ($r->{parent}) {
            Foswiki::Func::setPreferencesValue('taskeditor_parentid', $r->{parent});
        }

        my $m = Foswiki::Meta->new($session, Foswiki::Func::normalizeWebTopicName(undef, $f));
        if ($m) {
            $edtpl = $m->getPreference('TASKCFG_EDITOR_TEMPLATE');
            $m->finish();
        }
    }

    Foswiki::Func::setPreferencesValue('TASKCTX', $r->{Context});
    Foswiki::Func::setPreferencesValue('taskeditor_allowupload', $r->{allowupload} || 0);
    Foswiki::Func::loadTemplate( $r->{templatefile} || 'TasksAPI' );
    my $editor = Foswiki::Func::expandTemplate( $r->{editortemplate} || $edtpl || 'tasksapi::editor' );
    $editor = $meta->expandMacros( $editor );

    my @scripts = _getZone($session, $web, $topic, $meta, 'script');
    my @styles = _getZone($session, $web, $topic, $meta, 'head');

    return to_json({status => 'ok', editor => $editor, scripts => \@scripts, styles => \@styles});
}

# Fetch info about zones, used for dynamically loading scripts for the task
# editor
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
    my $r = from_json($q->param('request') || '{}');

    return to_json({status => 'ok'}) unless $r->{id};
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load(Foswiki::Func::normalizeWebTopicName(undef, $r->{id}));

    my $lease = $task->{meta}->getLease();
    if ( $lease ) {
        my $cuid = $lease->{user};
        my $ccuid = $session->{user};
        
        if ( $cuid eq $ccuid ) {
            $task->{meta}->clearLease();
            return to_json({status => 'ok'});
        }
    }

    return to_json({status => 'error', 'code' => 'clear_lease_failed', msg => "Could not clear lease"});
}

# Gets a rendered version of a task
sub _renderTask {
    my ($meta, $taskTemplate, $task) = @_;
    if ($renderRecurse >= 16) {
        return '%RED%Error: deep recursion in task rendering%ENDCOLOR%';
    }

    $renderRecurse++;
    local $currentTask = $task;
    my $canChange = $task->checkACL('CHANGE');
    my $haveCtx = $Foswiki::Plugins::SESSION->inContext('task_canedit') || 0;
    my $readonly = Foswiki::Func::getContext()->{task_readonly} || 0;
    $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx + 1) if $canChange;

    if ( $task->{_depth} ne 0 ) {
        $Foswiki::Plugins::SESSION->enterContext('task_showexpander', 1);
    } else {
        $Foswiki::Plugins::SESSION->leaveContext('task_showexpander');
    }

    $task = $meta->expandMacros(Foswiki::Func::expandTemplate($taskTemplate));
    if ($canChange && $haveCtx && !$readonly) {
        $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx); # decrement
    } elsif ($canChange) {
        $Foswiki::Plugins::SESSION->leaveContext('task_canedit'); # remove altogether
    }
    $renderRecurse--;
    return $task;
}

# Given an array of tasks, fetch children up to a specified depth
sub _deepen {
    my ($tasks, $depth, $order) = @_;

    for my $t (@$tasks) {
        $t->{_depth} = $depth;
    }

    my $thash = {};
    @{$thash}{map {$_->{id}} @$tasks} = @$tasks;
    my @taskstofetch = @$tasks;

    while ($depth > 0) {
        my @ids = map { $_->{id} } grep { $_->getBoolPref('HAS_CHILDREN') } @taskstofetch;
        last unless @ids;

        $depth--;
        my $children = query(query => {Parent => \@ids}, order => $order);
        @taskstofetch = ();
        for my $c (@{$children->{tasks}}) {
            $c->{_depth} = $depth;
            $thash->{$c->{id}} = $c;
            my $parent = $thash->{$c->{fields}{Parent}};
            $parent->{children_acl} ||= [];
            push @{$parent->{children_acl}}, $c;
            push @taskstofetch, $c;
        }
    }

    $tasks;
}

sub tagGrid {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName( $web, $topic );
    my $ctx = $params->{_DEFAULT} || $params->{context} || "$web.$topic";
    my $parent = $params->{parent} || "";
    my $id = $params->{id} || $gridCounter;
    $gridCounter += 1 if $id eq $gridCounter;
    my $system = $Foswiki::cfg{SystemWebName} || "System";
    my $form = $params->{form} || "$system.TasksAPIDefaultTaskForm";
    my $template = $params->{template} || 'tasksapi::grid';
    my $taskTemplate = $params->{tasktemplate};
    my $editorTemplate = $params->{editortemplate};
    my $captionTemplate = $params->{captiontemplate};
    my $filterTemplate = $params->{filtertemplate};
    my $states = $params->{states} || '%MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed,%MAKETEXT{"all"}%=all';
    my $pageSize = $params->{pagesize};
    my $paging = $params->{paging} || 0;
    my $infinite = $params->{infinite} || 0;
    my $query = $params->{query} || '{}';
    my $stateless = $params->{stateless} || 0;
    my $title = $params->{title} || '%MAKETEXT{"Tasks"}%';
    my $createText = $params->{createlinktext} || '%MAKETEXT{"Add task"}%';
    my $templateFile = $params->{templatefile} || 'TasksAPI';
    my $allowCreate = $params->{allowcreate} || 0;
    my $allowUpload = $params->{allowupload} || 0;
    my $readonly = $params->{readonly} || 0;
    my $showAttachments = $params->{showattachments} || 0;
    my $order = $params->{order} || '';
    my $depth = $params->{depth} || 0;
    my $offset = $params->{offset} || 0;
    my $sortable = $params->{sortable} || 0;
    my $autoassign = $params->{autoassign} || 'Decision=Team,Information=Team';
    my $autoassignTarget = $params->{autoassigntarget} || 'AssignedTo';

    my $_tplDefault = sub {
        $_[0] = $_[1] unless defined $_[0];
        $_[0] = 'tasksapi::empty' if $_[0] eq '';
    };
    $_tplDefault->($captionTemplate, 'tasksapi::grid::caption');
    $_tplDefault->($filterTemplate, 'tasksapi::grid::filter');

    Foswiki::Func::loadTemplate( $templateFile );

    my $mand = '%MAKETEXT{"Missing value for mandatory field"}%';
    my $close = '%MAKETEXT{"Do you really want to close the selected task?"}%';

    my $req = $session->{request};
    my %settings = (
        context => $ctx,
        parent => $parent,
        form => $form,
        id => $id,
        depth => int($depth),
        pagesize => $pageSize || 0,
        paging => $paging,
        infinite => $paging ? 0 : $infinite,
        offset => $offset,
        query => $query,
        order => $req->param('order') || $order,
        allowupload => $allowUpload,
        stateless => $stateless,
        sortable => $sortable,
        templatefile => $templateFile,
        tasktemplate => $taskTemplate,
        editortemplate => $editorTemplate,
        autoassign => $autoassign,
        autoassignTarget => $autoassignTarget,
        lang => {
            missingField => Foswiki::urlEncode(Foswiki::Func::expandCommonVariables($mand)),
            closeTask => Foswiki::urlEncode(Foswiki::Func::expandCommonVariables($close))
        }
    );

    my $page = $req->param('page') || 1;
    if ( $pageSize && $page gt 1 ) {
        $offset = (int($page) - 1) * int($pageSize);
    }

    my $fctx = Foswiki::Func::getContext();
    $fctx->{task_allowcreate} = 1 if $allowCreate;
    $fctx->{task_stateless} = 1 if $stateless;
    $fctx->{task_readonly} = 1 if $readonly;
    $fctx->{task_showexpandercol} = 1 if $depth;

    my @options = ();
    foreach my $state (split(/,/, $states)) {
        my ($text, $value) = split(/=/, $state);
        $value ||= $text;
        my $option = "<option value=\"$value\">$text</option>";
        push(@options, $option);
    }

    eval {
        $query = from_json($query);
    };
    if ($@) {
        my $err = $@;
        $err =~ s/&/&amp;/;
        $err =~ s/</&lt;/;
        return "%RED%TASKSGRID: invalid query ($@)%ENDCOLOR%%BR%";
    }
    $query->{Context} = $ctx unless $ctx eq 'any';
    $query->{Parent} = $parent unless $parent eq 'any';
    if ( $req->param('state') ) {
        if ( $req->param('state') eq 'all' ) {
            $query->{Status} = [qw(open closed)];
        } else {
            $query->{Status} = $req->param('state');
        }
    } else {
        $query->{Status} = 'open' if !exists $query->{Status};
    }

    $settings{query} = to_json($query);
    my $res = _query(
        query => $query,
        order => $req->param('order') || $params->{order},
        desc => $req->param('desc') eq 0 ? 0 : ($req->param('desc') || $params->{desc}),
        count => $params->{pagesize},
        offset => $offset
    );
    _deepen($res->{tasks}, $depth, $params->{order});

    my $select = join('\n', @options),
    $settings{totalsize} = $res->{total};
    my $json = to_json( \%settings );
    local $currentOptions = \%settings;

    my %tmplAttrs = (
        stateoptions => $select,
        settings => $json,
        captiontemplate => $captionTemplate,
        filtertemplate => $filterTemplate,
        id => $id,
    );
    local $currentExpands = \%tmplAttrs;
    for my $task (@{$res->{tasks}}) {
        $task = _renderTask($topicObject, $taskTemplate || $task->getPref('TASK_TEMPLATE') || 'tasksapi::task', $task);
    }
    $tmplAttrs{tasks} = join('', @{$res->{tasks}});

    my $grid = $topicObject->expandMacros(Foswiki::Func::expandTemplate($template));

    delete $fctx->{task_allowcreate};
    delete $fctx->{task_stateless};
    delete $fctx->{task_showexpandercol};

    my @jqdeps = ("blockui", "jqp::moment", "jqp::observe", "jqp::tooltipster", "jqp::underscore", "tasksapi", "ui::dialog");
    foreach (@jqdeps) {
        Foswiki::Plugins::JQueryPlugin::createPlugin( $_ );
    }

    my $pluginURL = '%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin';
    my $debug = $Foswiki::cfg{TasksAPIPlugin}{Debug} || 0;
    my $suffix = $debug ? '' : '.min';
    my $scriptDeps = 'JQUERYPLUGIN::JQP::UNDERSCORE';

    Foswiki::Func::addToZone( 'head', 'TASKSAPI::STYLES', <<STYLE );
<link rel='stylesheet' type='text/css' media='all' href='$pluginURL/css/tasktracker$suffix.css?version=$RELEASE' />
STYLE

    if ($sortable) {
        $scriptDeps .= ', JQTABLESORTERPLUGIN::Scripts';
        my $sortjs = <<SCRIPTS;
<script type="text/javascript" src="$pluginURL/js/tasks.tablesorter$suffix.js?version=$RELEASE"></script>
SCRIPTS
        Foswiki::Func::addToZone( 'script', 'TASKSAPI::SCRIPTS::TABLESORTER', $sortjs, 'JQTABLESORTERPLUGIN::Scripts' );
    }

    Foswiki::Func::addToZone( 'script', 'TASKSAPI::SCRIPTS', <<SCRIPT, $scriptDeps );
<script type="text/javascript" src="$pluginURL/js/tasktracker$suffix.js?version=$RELEASE"></script>
SCRIPT

    Foswiki::Func::getContext()->{'NOWYSIWYG'} = 0;
    require Foswiki::Plugins::CKEditorPlugin;
    Foswiki::Plugins::CKEditorPlugin::_loadEditor('', $topic, $web);

    # todo.. templates und so
    if ( $paging ) {
        my $prev = $page - 1 || 1;
        my $next= $page + 1;
        my $pagination = '';
        my $state = '&state=' . $req->param('state') if $req->param('state');
        $pagination .= "<a class=\"prev\" href=\"/$web/$topic?page=$prev$state\">%MAKETEXT{\"prev\"}%</a>" if $page gt 1;
        $pagination .= "<a class=\"next\" href=\"/$web/$topic?page=$next$state\">%MAKETEXT{\"next\"}%</a>" if ( $pageSize && $pageSize*$page <= $res->{total});
        $pagination = "<div class=\"tasks-pagination\"><div>$pagination</div></div>";
        $grid =~ s#</div></noautolink>$#$pagination</div></noautolink>#;
        return $grid
    }

    return $grid;
}

sub _renderChangeset {
    my ($meta, $task, $cset, $params) = @_;

    my $fields = $task->form->getFields;
    my $fsep = $params->{fieldseparator} || '';
    my $format = $params->{format} || '<div class="task-changeset"><div class="task-changeset-header"><span class="task-changeset-id">#$id</span>%MAKETEXT{"Updated by [_1] on [_2]" args="$user,$date"}%</div><ul class="task-changeset-fields">$fields</ul>$comment</div>';
    my $fformat = $params->{fieldformat} || '<li><strong>$title</strong>: <del>$old(shorten:140)</del> &#8594; <ins>$new(shorten:140)</ins>';
    my $faddformat = $params->{fieldaddformat} || '<li>%MAKETEXT{"[_1] added: [_2]" args="<strong>$title</strong>,$new(shorten:140)"}%</li>';
    my $fdeleteformat = $params->{fielddeleteformat} || '<li>%MAKETEXT{"[_1] removed: [_2]" args="<strong>$title</strong>,$old(shorten:140)"}%</li>';
    my @fout;
    my $exclude = $params->{excludefields} || '^$';

    my $xlate = sub {
        for my $v (@_) {
            $v = $meta->expandMacros($v);
        }
    };
    $xlate->($format, $fformat, $faddformat, $fdeleteformat);

    my $changes = _decodeChanges($cset->{changes});
    foreach my $f (@$fields) {
        my $change = $changes->{$f->{name}};
        next unless $change;
        next if $f->{name} =~ /$exclude/;

        my $out = $fformat;
        $out = $faddformat if $change->{type} eq 'add';
        $out = $fdeleteformat if $change->{type} eq 'delete';

        my $changeOld = $change->{old};
        my $changeNew = $change->{new};
        if ( $f->{type} eq 'date' ) {
            $changeOld = Foswiki::Time::formatTime($changeOld, $params->{timeformat} || '$day $month $year') if $changeOld =~ /^\d+$/;
            $changeNew = Foswiki::Time::formatTime($changeNew, $params->{timeformat} || '$day $month $year') if $changeNew =~ /^\d+$/;
        }

        $out =~ s#\$name#$f->{name}#g;
        $out =~ s#\$type#$change->{type}#g;
        $out =~ s#\$title#_translate($meta, $f->{tooltip}) || $f->{name}#eg;
        $out =~ s#\$old\(shorten:(\d+)\)#_shorten($changeOld, $1)#eg;
        $out =~ s#\$new\(shorten:(\d+)\)#_shorten($changeNew, $1)#eg;
        $out =~ s#\$old(\(\))?#$change->{old}#g;
        $out =~ s#\$new(\(\))?#$change->{new}#g;
        push @fout, $out;
    }
    return '' unless @fout || $cset->{comment};
    my $out = $format;
    $out =~ s#\$id#$cset->{name}#g;
    $out =~ s#\$user#$cset->{actor}#g;
    $out =~ s#\$date#Foswiki::Time::formatTime($cset->{at}, $params->{timeformat})#eg;
    $out =~ s#\$fields#join($fsep, @fout)#eg;
    $out =~ s#\$comment#$cset->{comment}#g;
    $out;
}

sub _shorten {
    my ($text, $len) = @_;
    return $text unless defined $len;
    $text =~ s/<.+?>//g;
    $text = Encode::decode($Foswiki::cfg{Site}{CharSet}, $text);
    $text = substr($text, 0, $len - 3) ."..." if length($text) > ($len + 3); # a bit of fuzz
    Encode::encode($Foswiki::cfg{Site}{CharSet}, $text);
}

# Given a task changeset as a JSON string, deserialize and convert legacy
# format into hash
sub _decodeChanges {
    my $changes = shift;
    return {} unless $changes;
    $changes = from_json($changes);
    if (ref $changes eq 'ARRAY') {
        $changes = { map { ($_->{name}, $_) } @$changes };
    }
    $changes;
}

sub tagInfo {
    my ( $session, $params, $topic, $web, $topicObject ) = @_;

    if (my $option = $params->{option}) {
        if (!$currentOptions) {
            return '%RED%TASKINFO: parameter =option= can only be used in grid/task templates%ENDCOLOR%%BR%';
        }
        return $currentOptions->{$option};
    }
    if (my $expand = $params->{expand}) {
        if (!$currentExpands) {
            return '%RED%TASKINFO: parameter =expand= can only be used in task grid templates%ENDCOLOR%%BR%';
        }
        return $currentExpands->{$expand};
    }
    if (my $expandTpl = $params->{expandtemplate}) {
        if (!$currentOptions) {
            return '%RED%TASKINFO: parameter =expandtemplate= can only be used in grid/task templates%ENDCOLOR%%BR%';
        }
        return Foswiki::Func::expandTemplate($expandTpl);
    }

    my $task = $currentTask;
    if ($params->{task}) {
        $task = Foswiki::Plugins::TasksAPIPlugin::Task::load(Foswiki::Func::normalizeWebTopicName(undef, $params->{task}));
    }
    if (!$task) {
        return '%RED%TASKINFO: not in a task template and no task parameter specified%ENDCOLOR%%BR%';
    }

    if (my $field = $params->{field}) {
        my $val = $task->{fields}{$field} || $params->{default} || '';
        if ($params->{type} && $params->{type} eq 'title') {
            return $task->form->getField($field)->{tooltip} || $field;
        }
        $val = _shorten($val, $params->{shorten});
        if ($params->{format}) {
            if ( $val =~ /^\d+$/ ) {
                $val = Foswiki::Time::formatTime($val, $params->{format});
            }

            $val =~ s/([^\d\s:\(\)]+)/%MAKETEXT\{$1\}%/;
        }
        if (Foswiki::isTrue($params->{escape}, 0)) {
            $val =~ s/&/&amp;/g;
            $val =~ s/</&lt;/g;
            $val =~ s/>/&gt;/g;
            $val =~ s/"/&quot;/g;
        }
        return $val;
    }
    if ($params->{type} && $params->{type} eq 'changeset') {
        my $cset;
        if ($params->{cid}) {
            $cset = $task->{meta}->get('TASKCHANGESET', $params->{cid});
        } else {
            $cset = $task->{meta}->get('TASKCHANGESET', $task->{changeset} || 'DNE');
        }
        return '' unless $cset && ref $cset;

        if ($params->{checkfield}) {
            my $checkfield = $params->{checkfield};
            return exists($cset->{$checkfield}) ? '1' : '0';
        }

        return _renderChangeset($topicObject, $task, $cset, $params);
    }
    if ($params->{type} && $params->{type} eq 'changesets') {
        my @out;
        foreach my $cset (sort { $b->{name} <=> $a->{name} } $task->{meta}->find('TASKCHANGESET')) {
            my $out = _renderChangeset($topicObject, $task, $cset, $params);
            push @out, $out if $out ne '';
        }
        return join($params->{separator} || "\n", @out);
    }
    if ($params->{type} && $params->{type} eq 'children') {
        my @out;
        for my $child (@{$task->cached_children || []}) {
            next if $child->{fields}{Status} eq 'deleted';
            push @out, _renderTask($topicObject, $currentOptions->{tasktemplate} || $child->getPref('TASK_TEMPLATE') || 'tasksapi::task', $child);
        }
        return join($params->{separator} || '', @out);
    }
    if ($params->{taskcfg}) {
        return $task->getPref(uc($params->{taskcfg}));
    }

    if (my $meta = $params->{meta}) {
        return $task->form->web .'.'. $task->form->topic if $meta eq 'form';
        return $task->id if $meta eq 'id';
        if ($meta eq 'json') {
            my $json = to_json(_enrich_data($task, 'tasksapi::empty'));
            $json =~ s/&/&amp;/g;
            $json =~ s/</&lt;/g;
            $json =~ s/>/&gt;/g;
            $json =~ s/"/&quot;/g;
            return $json;
        }

        return scalar $task->{meta}->find('FILEATTACHMENT') if $meta eq 'AttachCount';
        return scalar $task->{meta}->find('TASKCHANGESET') if $meta eq 'ChangesetCount';
        return scalar @{$task->cached_children || []} if $meta eq 'FetchedChildCount';
    }

    if (my $tpl = $params->{template}) {
        return _renderTask($topicObject, $tpl, $task);
    }

    return '';
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
