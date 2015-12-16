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
use File::MimeInfo;
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
    form => 1,
    Context => 1,
    Parent => 1,
    Status => 1,
    Author => 1,
    Created => 1,
    Due => 1,
    Position => 1,
);

my $gridCounter = 1;
my $indexerCalled;
my $renderRecurse = 0;
our $currentTask;
our $currentOptions;
our $currentExpands;
our $storedTemplates;
our $flavorcss;
our $flavorjs;

my $aclCache = {};
my $caclCache = {};
my $aclExpands = {};

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
    Foswiki::Func::registerTagHandler( 'TASKSFILTER', \&tagFilter );
    Foswiki::Func::registerTagHandler( 'TASKINFO', \&tagInfo );

    my %restopts = (authenticate => 1, validate => 0, http_allow => 'POST');
    Foswiki::Func::registerRESTHandler( 'attach', \&restAttach, %restopts );
    Foswiki::Func::registerRESTHandler( 'create', \&restCreate, %restopts );
    Foswiki::Func::registerRESTHandler( 'delete', \&restDelete, %restopts );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate, %restopts );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate, %restopts );

    $restopts{http_allow} = 'GET';
    Foswiki::Func::registerRESTHandler( 'download', \&restDownload, %restopts );
    Foswiki::Func::registerRESTHandler( 'lease', \&restLease, %restopts );
    Foswiki::Func::registerRESTHandler( 'search', \&restSearch, %restopts );
    Foswiki::Func::registerRESTHandler( 'release', \&restRelease, %restopts );

    if ($Foswiki::cfg{Plugins}{SolrPlugin}{Enabled}) {
      require Foswiki::Plugins::SolrPlugin;
      Foswiki::Plugins::SolrPlugin::registerIndexTopicHandler(
        \&indexTopicHandler
      );
    }

    $indexerCalled = 0;

    return 1;
}

sub finishPlugin {
    undef $db;
    undef %schema_versions;
    $aclCache = {};
    $caclCache = {};
    $aclExpands = {};
    $gridCounter = 1;
    $renderRecurse = 0;
}

sub indexTopicHandler {
    my ($indexer, $doc, $web, $topic, $meta, $text) = @_;

    my $topicType = $meta->get('FIELD', 'TopicType');
    return unless ref $topicType;
    return unless $topicType->{value} eq 'task';

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName($web, $topic);
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    return unless $task;

    my $legacy = $Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration} || 0;
    $task->solrize($indexer, $legacy);
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
            sqlite_unicode => $Foswiki::UNICODE ? 1 : 0
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
            $q = 't.id' if $q eq 'id';
        } else {
            my $t = "j_$q";
            $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$q')" unless $joins{$q};
            $joins{$q} = 1;
            $order = "$t.value" if $order eq $q;
            $q = "$t.value";
        }

        if (ref($v) eq 'ARRAY') {
            $filter .= "$filterprefix $q IN(". join(',', map { '?' } @$v) .")";
            push @args, @$v;
        } elsif (ref($v) eq 'HASH') {
            if ($v->{type} eq 'range') {
                $filter .= "$filterprefix $q BETWEEN ? AND ?";
                push @args, $v->{from}, $v->{to};
            } elsif ($v->{type} eq 'like') {
                $filter .= "$filterprefix $q LIKE ?";
                push @args, "\%$v->{substring}%";
            } else {
                Foswiki::Func::writeWarning("Invalid query object: type = $v->{type}");
            }
        } else {
            $filter .= "$filterprefix $q = ?";
            push @args, $v;
        }
        $filterprefix = ' AND';
    }

    if ($order && !$singles{$order} && !$joins{$order}) {
        my $t = "$order";
        $t = "j_$t" unless $t =~ /^j_/;
        $join .= " JOIN task_multi $t ON(t.id = $t.id AND $t.type='$order')";
        $order = "$t";
        $order .= ".value" unless $order =~ /\.value$/;
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
    # Convert to Unicode as a workaround for bad constellation of perl/DBD::SQLite versions
    my $raw = $Foswiki::UNICODE ? $task->{meta}->getEmbeddedStoreForm : Encode::decode($Foswiki::cfg{Site}{CharSet}, $task->{meta}->getEmbeddedStoreForm);
    my %vals = (
        id => $task->{id},
        form => $form->web .'.'. $form->topic,
        Parent => '',
        raw => $raw,
    );
    my @extra;
    for my $f (keys %{$task->{fields}}) {
        my $v = $task->{fields}{$f};
        next unless defined $v;
        my $field = $form->getField($f);
        if ($field && $field->can('isMultiValued') && $field->isMultiValued()) {
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
    my $noprint = shift;
    my $db = db();
    $db->begin_work;
    $db->do("DELETE FROM tasks");
    $db->do("DELETE FROM task_multi");
    foreach my $t (Foswiki::Plugins::TasksAPIPlugin::Task::loadMany()) {
        print $t->{id} ."\n" unless $noprint;
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
sub _cacheACLExpands {
    $aclExpands->{$_[0]} = $_[1];
}
sub _cachedACLExpands {
    my $acl = shift;
    $aclExpands->{$acl};
}

sub restDownload {
    my ( $session, $subject, $verb, $response ) = @_;

    my $q = $session->{request};
    my $id = $q->param('id') || '';
    my $file = $q->param('file') || '';

    unless ($id && $file) {
        $response->header(-status => 400);
        return to_json({
            status => 'error',
            'code' => 'client_error',
            msg => "Request error: Missing filename or task id parameter."
        });
    }

    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $id);
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    unless ($task->checkACL('change')) {
        $response->header(-status => 403);
        return to_json({
            status => 'error',
            code => 'acl_change',
            msg => 'No permission to attach files to this task'
        });
    }

    $response->header(
        -type => mimetype($file),
        -status => 200,
        "-Content-Disposition" => "attachment; filename=\"$file\"",
        "-Content-Transfer-Encoding" => "binary"
    );

    eval {
        my $fh = $task->{meta}->openAttachment($file, '<');
        local $/;
        $response->body( <$fh> );
    };
    if($@) {
        Foswiki::Func::writeWarning( $@ );
        $response->header(-status => 500);
        return to_json({
            status => 'error',
            'code' => 'server_error',
            msg => "Server error: $@"
        });
    }
}

sub restDelete {
    my ( $session, $subject, $verb, $response ) = @_;

    my $q = $session->{request};
    my $id = $q->param('id') || '';
    my $file = $q->param('file') || '';

    unless ($id && $file) {
        $response->header(-status => 400);
        return to_json({
            status => 'error',
            'code' => 'client_error',
            msg => "Request error: Missing filename or task id parameter."
        });
    }

    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $id);
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    unless ($task->checkACL('change')) {
        $response->header(-status => 403);
        return to_json({
            status => 'error',
            code => 'acl_change',
            msg => 'No permission to remove attachments of this task'
        });
    }

    my $trash = $Foswiki::cfg{TrashWebName} || 'Trash';
    $topic = "$topic-".time();
    unless (Foswiki::Func::topicExists($trash, $topic)) {
        Foswiki::Func::saveTopic($trash, $topic, undef, undef, {dontlog => 1, ignorepermissions => 1});
    }

    my $to = Foswiki::Meta->load($session, Foswiki::Func::normalizeWebTopicName($trash, $topic));
    $task->{meta}->moveAttachment($file, $to);
    my @changesets = $task->{meta}->find('TASKCHANGESET');
    my @ids = sort {$a <=> $b} (map {int($_->{name})} @changesets);
    my $newid = 1 + pop(@ids);

    my @changes = ({type => 'delete', name => '_attachment', old => $file});
    $task->{meta}->putKeyed('TASKCHANGESET', {
        name => $newid,
        actor => Foswiki::Func::getWikiName(),
        at => scalar(time),
        changes => to_json(\@changes)
    });

    $task->{meta}->saveAs($web, $topic, dontlog => 1, minor => 1);
    Foswiki::Plugins::TasksAPIPlugin::_index($task);
    $task->{changeset} = $newid;

    $response->header(-status => 200);
    return '';
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

        my @changesets = $task->{meta}->find('TASKCHANGESET');
        my @ids = sort {$a <=> $b} (map {int($_->{name})} @changesets);
        my $newid = 1 + pop(@ids);

        my @changes = ({type => 'add', name => '_attachment', new => $name});
        $task->{meta}->putKeyed('TASKCHANGESET', {
            name => $newid,
            actor => Foswiki::Func::getWikiName(),
            at => scalar(time),
            changes => to_json(\@changes)
        });

        $task->{meta}->saveAs($web, $topic, dontlog => 1, minor => 1);
        Foswiki::Plugins::TasksAPIPlugin::_index($task);
        $task->{changeset} = $newid;
        $task->notify('changed');
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
        data => _enrich_data($res, $q->param('tasktemplate')),
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

    _deepen([$task], $depth, $order);
    return to_json({
        status => 'ok',
        data => _enrich_data($task, $q->param('tasktemplate')),
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
        $res{$id} = {status => 'ok', data => _enrich_data($task, $q->param('tasktemplate'))};
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
    my $tpl = shift;

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
            tooltip => _translate($task->{meta}, $f->{tooltip} || ''),
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

sub tagFilter {
    my( $session, $params, $topic, $web, $meta ) = @_;
    my $filter = $params->{_DEFAULT} || $params->{field} || '';
    return '' unless $filter;

    my $sys = $Foswiki::cfg{SystemWebName} || 'System';
    my $ftopic = $params->{form} || $currentOptions->{form} || "$sys.TasksAPIDefaultTaskForm";
    my $isrange = $params->{range} || 0;
    my $ismulti = $params->{multi} || 0;
    my $min = $params->{min} || '';
    my $minto = $params->{minto} || '';
    my $minfrom = $params->{minfrom} || '';
    my $max = $params->{max} || '';
    my $maxto = $params->{maxto} || '';
    my $maxfrom = $params->{maxfrom} || '';
    my $format = $params->{format} || ''; # ToDo
    my $title = $params->{title} || '';

    my $form = Foswiki::Form->new($session, Foswiki::Func::normalizeWebTopicName(undef, $ftopic) );
    my $fields = $form->getFields;
    my @html = ('<div>');
    foreach my $f (@$fields) {
        next unless $f->{name} eq $filter;
        $title = $f->{title} || $f->{name} unless $title;
        push(@html, "<span class=\"hint\">%MAKETEXT{\"$title\"}%:</span>");

        if ($f->{type} =~ /^date2?$/) {
            my $dmin = ($minfrom || $min) ? "data-min=\"" . ($minfrom || $min) . "\"" : '';
            my $dmax = ($maxfrom || $max) ? "data-max=\"" . ($maxfrom || $max) . "\"" : '';
            push(@html, "<input type=\"text\" name=\"${filter}-from\" $dmin $dmax class=\"filter foswikiPickADate\">");
            if ($isrange) {
                $dmin = ($minto || $min) ? "data-min=\"" . ($minto || $min) . "\"" : '';
                $dmax = ($maxto || $max) ? "data-max=\"" . ($maxto || $max) . "\"" : '';
                push(@html, "<span>-</span>");
                push(@html, "<input type=\"text\" name=\"${filter}-to\" $dmin $dmax class=\"filter foswikiPickADate\">");
            }
        } elsif ($f->{type} =~ /^text$/) {
            push(@html, "<input type=\"text\" name=\"${filter}-like\" class=\"filter\">");
        } elsif ($f->{type} =~ /^select/) {
            push(@html, "<select name=\"$filter\" class=\"filter\">");
            my @opts = ();
            my @labels = ();
            my @arr = split(',', $f->{value});
            foreach my $a (@arr) {
                next if ($f->{name} eq 'Status' && $a =~ /deleted/ && !Foswiki::Func::isAnAdmin());
                $a =~ s/(^\s*)|(\s*$)//g;
                if ( $f->{type} =~ m/values/i ) {
                    my @pair = split('=', $a);
                    push(@opts, pop @pair);
                    push(@labels, pop @pair);
                } else {
                    push(@opts, $a);
                }
            }

            my @options = ();
            if ( scalar @opts eq scalar @labels) {
                for (my $i=0; $i < scalar @opts; $i++) {
                    my $val = $opts[$i];
                    $val =~ s/(^\s*)|(\s*$)//g;
                    my $label = $labels[$i];
                    $label =~ s/(^\s*)|(\s*$)//g;
                    push(@options, "<option value=\"$val\">$label</option>")
                }
            } else {
                for (my $i=0; $i < scalar @opts; $i++) {
                    my $val = $opts[$i];
                    $val =~ s/(^\s*)|(\s*$)//g;
                    push(@options, "<option value=\"$val\">$val</option>")
                }
            }

            my $selected = '';
            if ($f->{name} ne 'Status') {
                $selected = 'selected="selected"';
            }

            push(@options, "<option value=\"all\" $selected>%MAKETEXT{\"all\"}%</option>");
            push(@html, @options);
            push(@html, "</select>");
        } elsif ($f->{type} =~ /^user/) {
            # ToDo
        }
    }

    push(@html, '</div>');
    join('', @html);
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
    my @tasks = map { _enrich_data($_, $req->{tasktemplate}) } @{$res->{tasks}};
    return to_json({status => 'ok', data => \@tasks});
}

sub restLease {
    my ( $session, $subject, $verb, $response ) = @_;
    my $q = $session->{request};
    my $r = from_json($q->param('request') || '{}');

    my $meta;
    my $edtpl;
    my $tplfile;
    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $r->{Context});

    if ($r->{context}) {
        Foswiki::Func::setPreferencesValue('taskeditor_context', $r->{context});
    }

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
        $tplfile = $task->getPref('TASK_TEMPLATE_FILE');

        Foswiki::Func::setPreferencesValue('taskeditor_form', $task->{form}->web .'.'. $task->{form}->topic);
        Foswiki::Func::setPreferencesValue('taskeditor_isnew', '0');
        Foswiki::Func::setPreferencesValue('taskeditor_task', $r->{id});
    } else {
        $meta = Foswiki::Meta->new($session, $web, $topic);
        my $f = $r->{form} || 'System.TasksAPIDefaultTaskForm';
        Foswiki::Func::setPreferencesValue('taskeditor_form', $f);
        Foswiki::Func::setPreferencesValue('taskeditor_isnew', '1');

        if ($r->{parent}) {
            Foswiki::Func::setPreferencesValue('taskeditor_parent', $r->{parent});
        }

        my $m = Foswiki::Meta->new($session, Foswiki::Func::normalizeWebTopicName(undef, $f));
        if ($m) {
            $edtpl = $m->getPreference('TASKCFG_EDITOR_TEMPLATE');
            $tplfile = $m->getPreference('TASKCFG_TASK_TEMPLATE_FILE');
            $m->finish();
        }
    }

    Foswiki::Func::setPreferencesValue('TASKCTX', $r->{Context});
    Foswiki::Func::setPreferencesValue('taskeditor_allowupload', $r->{allowupload} || 0);
    Foswiki::Func::loadTemplate( $r->{templatefile} || $tplfile || 'TasksAPI' );
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
    my ($meta, $taskTemplate, $task, $addtozone) = @_;
    if ($renderRecurse >= 16) {
        return '%RED%Error: deep recursion in task rendering%ENDCOLOR%';
    }

    $renderRecurse++;
    local $currentTask = $task;
    $taskTemplate = $task->getPref('TASK_TEMPLATE') || 'tasksapi::task' unless $taskTemplate;
    my $canChange = $task->checkACL('CHANGE');
    my $haveCtx = $Foswiki::Plugins::SESSION->inContext('task_canedit') || 0;
    my $readonly = Foswiki::Func::getContext()->{task_readonly} || 0;
    $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx + 1) if $canChange;

    if ( $task->{_depth} ne 0 ) {
        $Foswiki::Plugins::SESSION->enterContext('task_showexpander', 1);
    } else {
        $Foswiki::Plugins::SESSION->leaveContext('task_showexpander');
    }

    my $flavor = {};
    my $type = $task->getPref('TASK_TYPE');
    my $file = $task->getPref('TASK_TEMPLATE_FILE');
    my $q = $Foswiki::Plugins::SESSION->{request};
    if ( ($currentOptions->{flavor} || $q->param('flavor')) && $taskTemplate ne 'tasksapi::empty' ) {
        $flavor->{name} = $currentOptions->{flavor} || $q->param('flavor');
        $flavor->{type} = $type;
        $flavor->{file} = $file;
    }

    if ( $flavor->{name} ) {
        my $tmpl = $taskTemplate . '_' . $flavor->{name};
        $type = ($flavor->{type} || '_default') . '_' . $flavor->{name};

        if ( $addtozone ) {
            unless ($flavorcss->{$type}) {
                _addToZone($meta, 'head', $task->getPref('FLAVOR_CSS')) if ($task->getPref('FLAVOR_CSS'));
                _addToZone($meta, 'head', $task->getPref('FLAVOR_CSS')) if ($task->getPref(uc($flavor->{name}) . '_CSS'));
                $flavorcss->{$type} = 1;
            }

            unless ($flavorjs->{$type}) {
                _addToZone($meta, 'script', $task->getPref('FLAVOR_JS')) if ($task->getPref('FLAVOR_JS'));
                _addToZone($meta, 'script', $task->getPref(uc($flavor->{name}) . '_JS')) if ($task->getPref(uc($flavor->{name}) . '_JS'));
                $flavorjs->{$type} = 1;
            }
        }

        if ( $storedTemplates->{$type} ) {
            $task = $meta->expandMacros($storedTemplates->{$type});
        } else {
            Foswiki::Func::loadTemplate($flavor->{file}) if $flavor->{file};
            $storedTemplates->{$type} = Foswiki::Func::expandTemplate($tmpl);
            $task = $meta->expandMacros($storedTemplates->{$type});
        }
    } else {
        unless ($storedTemplates->{$type || "$taskTemplate"}) {
            Foswiki::Func::loadTemplate($file) if $file;
            $storedTemplates->{$type || "$taskTemplate"} = Foswiki::Func::expandTemplate($taskTemplate);
        }

        $task = $meta->expandMacros($storedTemplates->{$type || "$taskTemplate"});
    }

    if ($canChange && $haveCtx && !$readonly) {
        $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx); # decrement
    } elsif ($canChange) {
        $Foswiki::Plugins::SESSION->leaveContext('task_canedit'); # remove altogether
    }
    $renderRecurse--;
    return $task;
}

sub _addToZone {
    my ($meta, $zone, $path) = @_;

    my @paths = ();
    if ( $path =~ /,/ ) {
        foreach my $p (split(/,/, $path)) {
            push(@paths, $meta->expandMacros($p));
        }
    } else {
        push(@paths, $meta->expandMacros($path));
    }

    my $section = 'TASKSAPI::FLAVOR::' . ($zone eq 'head' ? 'STYLES' : 'SCRIPTS');
    my $dep = 'TASKSAPI::' . ($zone eq 'head' ? 'STYLES' : 'SCRIPTS');
    $dep .= ', jsi18nCore' if $zone eq 'script';
    my @includes = ();
    foreach my $p (@paths) {
        if ($zone eq 'head') {
            push @includes, "<link rel=\"stylesheet\" type=\"text/css\" media=\"all\" href=\"$p\" />";
        } else {
            push @includes, "<script type=\"text/javascript\" src=\"$p\"></script>";
        }

        Foswiki::Func::addToZone($zone, $section, join("\n", @includes), $dep);
    }
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
    my $id = $params->{id} || "tracker-$gridCounter";
    $gridCounter += 1 if $id eq "tracker-$gridCounter";
    my $system = $Foswiki::cfg{SystemWebName} || "System";
    my $form = $params->{form};
    my $template = $params->{template} || 'tasksapi::grid';
    my $taskTemplate = $params->{tasktemplate};
    my $editorTemplate = $params->{editortemplate};
    my $captionTemplate = $params->{captiontemplate};
    my $filterTemplate = $params->{filtertemplate};
    my $states = $params->{states} || '%MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed,%MAKETEXT{"all"}%=all';
    my $statesMapping = $params->{statesmapping} || '';
    my $mappingField = $params->{mappingfield} || '';
    my $pageSize = $params->{pagesize} || 25;
    my $paging = $params->{paging};
    $paging = 1 unless defined $paging;
    my $query = $params->{query} || '{}';
    my $templateFile = $params->{templatefile};
    my $allowCreate = $params->{allowcreate};
    $allowCreate = 1 unless defined $allowCreate;
    my $allowUpload = $params->{allowupload};
    $allowUpload = 1 unless defined $allowUpload;
    my $keepclosed = $params->{keepclosed};
    $keepclosed = 1 unless defined $keepclosed;
    my $titlelength = $params->{titlelength} || 100;
    my $readonly = $params->{readonly} || 0;
    my $showAttachments = $params->{showattachments};
    $showAttachments = 1 unless defined $showAttachments;
    my $order = $params->{order} || 'Created';
    my $depth = $params->{depth} || 0;
    my $offset = $params->{offset} || 0;
    my $sortable = $params->{sortable};
    $sortable = 1 unless defined $sortable;
    my $autoassign = $params->{autoassign} || 'Decision=Team,Information=Team';
    my @autouser = map {(split(/=/, $_))[-1]} split(/,/, $autoassign);
    my $autoassignTarget = $params->{autoassigntarget} || 'AssignedTo';
    my $flavor = $params->{flavor} || $params->{flavour} || '';
    my $desc = $params->{desc};
    $desc = 1 unless defined $desc;
    my $title = $params->{title} || '';
    my $createText = $params->{createlinktext};
    $createText = '%MAKETEXT{"Add task"}%' unless defined $createText;

    require Foswiki::Contrib::PickADateContrib;
    Foswiki::Contrib::PickADateContrib::initDatePicker();

    if ($readonly) {
        $allowCreate = 0;
        $allowUpload = 0;
    }

    unless ($ctx eq 'any') {
        $form = "$system.TasksAPIDefaultTaskForm" unless $form;
        $templateFile = 'TasksAPI' unless $templateFile;
    }

    my $_tplDefault = sub {
        $_[0] = $_[1] unless defined $_[0];
        $_[0] = 'tasksapi::empty' if $_[0] eq '';
    };
    $_tplDefault->($captionTemplate, 'tasksapi::grid::caption');
    $_tplDefault->($filterTemplate, 'tasksapi::grid::filter');

    Foswiki::Func::loadTemplate( $templateFile );

    my $req = $session->{request};
    my $trackerid = $req->param('tid') || '';
    my $override = $trackerid eq $id || ($gridCounter - 1 eq 1 && $trackerid eq '');
    if ( $req->param('order') && $override ) {
        $order = $req->param('order');
    }

    if ( defined $req->param('desc') && $override ) {
        $desc = $req->param('desc') eq 0 ? 0 : $req->param('desc');
    }

    if ( $req->param('pagesize') && $override ) {
        $pageSize = $req->param('pagesize');
    }

    my $page = 1;
    $page = $req->param('page') if $req->param('page') && $override;
    if ( $pageSize && $page gt 1  && $override ) {
        $offset = (int($page) - 1) * int($pageSize);
    }

    my %settings = (
        context => $ctx,
        parent => $parent,
        form => $form,
        id => $id,
        depth => int($depth),
        pagesize => int($pageSize),
        paging => $paging,
        offset => $offset,
        query => $query,
        order => $order,
        desc => $desc,
        allowupload => $allowUpload,
        keepclosed => $keepclosed,
        sortable => $sortable,
        templatefile => $templateFile,
        tasktemplate => $taskTemplate,
        flavor => $flavor,
        editortemplate => $editorTemplate,
        autoassign => $autoassign,
        autoassignTarget => $autoassignTarget,
        autouser => \@autouser,
        titlelength => int($titlelength)
    );

    if ( $mappingField && $statesMapping ) {
        my %map = ();
        $map{field} = $mappingField;

        $statesMapping =~ s/\s+//g;
        my @mappings = split(/(?<=\]),?/, $statesMapping);
        foreach my $mapping (@mappings) {
            $mapping =~ /([^=]+)=\[([\w,]+)\]/;
            my @arr = split(/,/, $2);
            $map{mappings}{$1} = \@arr;
        }

        $settings{mapping} = \%map;
    }

    my $fctx = Foswiki::Func::getContext();
    $fctx->{task_allowcreate} = 1 if $allowCreate;
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


    my $mapstates = sub {
        my $query = shift;
        my $settings = shift;
        if ( $settings{mapping} ) {
            while ( my ($k, $v) = each %{$settings{mapping}{mappings}} ) {
                next if $k eq 'all';
                if ( grep(/$query->{Status}/, @$v) ) {
                    $query->{$settings{mapping}{field}} = $query->{Status};
                    $query->{Status} = $k;
                    last;
                }
            }
        }
    };

    if ( $req->param('state') && $override && !$req->param('f_Status') ) {
        if ( $req->param('state') eq 'all' ) {
            if ( $settings{mapping} && $settings{mapping}{mappings}{all}) {
                $query->{$settings{mapping}{field}} = $settings{mapping}{mappings}{all};
            }
        } else {
            $query->{Status} = $req->param('state');
            $mapstates->($query, %settings);
        }
    } else {
        $query->{Status} = 'open' if !exists $query->{Status} && !$req->param('f_Status');
        $mapstates->($query, %settings);
    }

    my @list = map {$_ =~ s/^f_//; $_} grep(/^f_/, @{$req->{param_list}});
    foreach my $l (@list) {
        my $val = $req->param("f_$l");
        if ($l !~ /_(l|r)$/) {
            $query->{$l} = $val;
        } else {
            my %range;

            if ($l =~ /_r$/) {
                my @arr = split(/_/, $val);
                $l =~ s/_r$//;
                %range = (
                    type => 'range',
                    from => int($arr[0]),
                    to => int($arr[1])
                );
            } else {
                $l =~ s/_l$//;
                %range = (
                    type => 'like',
                    substring => $val,
                );
            }

            $query->{$l} = \%range;
        }
    }

    if ($form) {
        while (my ($k, $v) = each %$query) {
            if ($v eq 'all') {
                my $f = Foswiki::Form->new($session, Foswiki::Func::normalizeWebTopicName(undef, $form) );
                my $field = $f->getField($k);
                next unless $field->{type} =~ /^select/;
                my @vals = split(/\s*,\s*/, $field->{value});
                my @arr = ();
                foreach my $v (@vals) {
                    next if ($k eq 'Status' && $v =~ /deleted/ && !Foswiki::Func::isAnAdmin());
                    if ( $field->{type} =~ m/values/i ) {
                        my @pair = split(/\s*=\s*/, $v);
                        push(@arr, pop @pair);
                    } else {
                        push(@arr, $v);
                    }
                }
                $query->{$k} = \@arr;
            }
        }
    }

    if ( $req->param('id') ) {
        $query->{id} = $req->param('id');
    }

    $settings{query} = to_json($query);
    my $res = _query(
        query => $query,
        order => $order,
        desc => $desc,
        count => $pageSize,
        offset => $offset
    );
    _deepen($res->{tasks}, $depth, $params->{order});

    my $select = join('\n', @options);
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
        my $tmpl = $taskTemplate || $task->getPref('TASK_TEMPLATE') || 'tasksapi::task';
        $task = _renderTask($topicObject, $tmpl, $task, 1);
    }
    $tmplAttrs{tasks} = join('', @{$res->{tasks}});

    my $grid = $topicObject->expandMacros(Foswiki::Func::expandTemplate($template));
    $grid =~ s/\$grid_title/$title/ge;
    $grid =~ s/\$create_text/$createText/ge;

    delete $fctx->{task_allowcreate};
    delete $fctx->{task_showexpandercol};

    my @jqdeps = (
        "blockui", "select2", "tabpane", "tasksapi", "ui::dialog",
        "jqp::moment", "jqp::observe", "jqp::tooltipster", "jqp::underscore",
        "jqp::readmore", "jqp::sweetalert2"
    );
    foreach (@jqdeps) {
        Foswiki::Plugins::JQueryPlugin::createPlugin( $_ );
    }

    my $pluginURL = '%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin';
    my $debug = $Foswiki::cfg{TasksAPIPlugin}{Debug} || 0;
    my $suffix = $debug ? '' : '.min';
    my $scriptDeps = 'JQUERYPLUGIN::JQP::UNDERSCORE';
    my $lang = $session->i18n->language();
    $lang = 'en' unless ( $lang =~ /^(de|en)$/);

require Foswiki::Form::Select2;
Foswiki::Form::Select2->addJavascript();

    Foswiki::Func::addToZone( 'head', 'TASKSAPI::STYLES', <<STYLE );
<link rel='stylesheet' type='text/css' media='all' href='%PUBURLPATH%/%SYSTEMWEB%/FontAwesomeContrib/css/font-awesome$suffix.css?version=$RELEASE' />
<link rel='stylesheet' type='text/css' media='all' href='$pluginURL/css/tasktracker$suffix.css?version=$RELEASE' />
<link rel='stylesheet' type='text/css' media='print' href='$pluginURL/css/tasktracker.print$suffix.css?version=$RELEASE' />
STYLE

    Foswiki::Func::addToZone( 'script', 'TASKSAPI::SCRIPTS', <<SCRIPT, $scriptDeps );
<script type="text/javascript" src="$pluginURL/js/tasktracker$suffix.js?version=$RELEASE"></script>
SCRIPT

    Foswiki::Func::addToZone( 'script', 'TASKSAPI::I18N', <<SCRIPT, 'jsi18nCore' );
<script type="text/javascript" src="$pluginURL/js/i18n/jsi18n.$lang$suffix.js?version=$RELEASE"></script>
SCRIPT

    Foswiki::Func::getContext()->{'NOWYSIWYG'} = 0;
    require Foswiki::Plugins::CKEditorPlugin;
    Foswiki::Plugins::CKEditorPlugin::_loadEditor('', $topic, $web);

    # todo.. templates und so
    if ( $paging && $settings{totalsize} > $settings{pagesize}) {
        my $prev = $page - 1 || 1;
        my $next= $page + 1;
        my $pagination = '';

        my @q = ("tid=$id");
        push(@q, 'state=' . ($req->param('state') || $req->param('f_Status'))) if ($req->param('state') || $req->param('f_Status')) && $override;
        push(@q, 'order=' . $req->param('order')) if $req->param('order') && $override;
        push(@q, 'desc=' . $req->param('desc')) if defined $req->param('desc') && $override;
        push(@q, 'tab=' . $req->param('tab')) if $req->param('tab');
        push(@q, 'pagesize=' . $req->param('pagesize')) if $req->param('pagesize') && $override;
        my $qstr = "&" . join('&', grep(/^.+$/, @q));

        my $cur = 1;
        my $pages = '';
        for (my $c = $settings{totalsize}/$settings{pagesize}; $c > 0; $c--) {
            my $cls = $page == $cur ? 'active' : '';
            $pages .= "<li class=\"$cls\"><a href=\"%SCRIPTURLPATH{view}%/$web/$topic?page=$cur$qstr\">$cur</a></li>";
            $cur++;
        }

        my $prevState = $page gt 1 ? '' : 'disabled';
        my $nextState = ($pageSize && $pageSize*$page <= $res->{total}) ? '' : 'disabled';
        my $pager = <<PAGER;
<nav class="pagination-container no-print">
  <ul class="pagination">
    <li class="$prevState"><a href="%SCRIPTURLPATH{"view"}%/$web/$topic?page=$prev$qstr" title="%MAKETEXT{"Previous page"}%"><span>&laquo;</span></a></li>
    $pages
    <li class="$nextState"><a href="%SCRIPTURLPATH{"view"}%/$web/$topic?page=$next$qstr" title="%MAKETEXT{"Next page"}%"><span>&raquo;</span></a></li>
  </ul>
</nav>
PAGER
        $cur = $cur - 1;
        if ( $cur gt 1 ) {
            $pager .= "<nav class=\"pagination-container print-only\">%MAKETEXT{\"Page [_1] of [_2]\" args=\"$page,$cur\"}%</nav>";
        }

        $grid =~ s#</div></noautolink>$#$pager</div></noautolink>#;
        return $grid
    }

    return $grid;
}

sub _getDisplayName {
    my $usr = shift;
    $usr =~ s/\s+//g;
    my $session = $Foswiki::Plugins::SESSION;
    my $mapping = $session->{users}->_getMapping($usr);
    return $mapping->can('getDisplayName') ? $mapping->getDisplayName($usr) : $session->{users}->getWikiName($usr);
}

sub _renderAttachment {
    my ($meta, $task, $attachment, $params) = @_;

    my $author = $attachment->{author};
    my $displayauthor = $author;
    $displayauthor = _getDisplayName($author) if $author;
    my $taskstopic = $task->{id};
    my $date = Foswiki::Func::formatTime($attachment->{date}->{epoch}, '$day $month $year');
    $taskstopic =~ s/\./\//;
    my $format = $params->{format} || '<tr><td>%MIMEICON{"$name" size="24" theme="oxygen"}%</td><td class="by"><span>$displayauthor</span><span>$date</span></td><td>$name<a href="$name" target="_blank" class="hidden"></a></td><td>$size</td><td class="delete-attachment" title="%MAKETEXT{"Delete attachment"}%"><i class="fa fa-times"></i></td></tr>';
    $format =~ s#\$name#$attachment->{name}#g;
    $format =~ s#\$size#$attachment->{size}->{human}#g;
    $format =~ s#\$author#$author#g;
    $format =~ s#\$displayauthor#$displayauthor#g;
    $format =~ s#\$date#$date#g;
    $format =~ s#\$taskstopic#$taskstopic#g;
    $format;
}

sub _renderChangeset {
    my ($meta, $task, $cset, $params) = @_;

    my $fields = $task->form->getFields;
    my $fsep = $params->{fieldseparator} || '';

    my $plain = Foswiki::isTrue($params->{nohtml}, 0);
    my $defaultFormat;
    if ( $plain ) {
        if ( $cset->{comment} ) {
            $defaultFormat = <<FORMAT;
%MAKETEXT{"[_1] on [_2]" args="\$displayuser,\$date"}%
\$fields

%MAKETEXT{"Comment"}%:
\$comment
FORMAT
        } else {
            $defaultFormat = <<FORMAT;
%MAKETEXT{"[_1] on [_2]" args="\$displayuser,\$date"}%
\$fields
FORMAT
        }
    } else {
        $defaultFormat = '<div class="task-changeset"><div class="task-changeset-header">$addComment<span class="task-changeset-id">#$id</span> %MAKETEXT{"[_1] on [_2]" args="$displayuser,$date"}%</div><ul class="task-changeset-fields">$fields</ul><div class="task-changeset-comment" data-id="$id">$icons<div class="comment">$comment</div></div></div>';
    }
    my $format = $params->{format} || $defaultFormat;
    my $addComment = '';
    my $editComment = '';
    unless ( $params->{format} ) {
        my $actor = Foswiki::Func::wikiToUserName(Foswiki::Func::getWikiName($cset->{actor}));
        my $curUser = Foswiki::Func::wikiToUserName(Foswiki::Func::getWikiName($Foswiki::Plugins::SESSION->{user}));
        if ( $actor eq $curUser )  {
            $addComment  = '%IF{"\'%TASKINFO{field="Status"}%\'!=\'closed\' AND \'$encComment\'=\'\'" then="<a href=\"#\" class=\"task-changeset-add\" title=\"$percntMAKETEXT{\"Add comment\"}$percnt\"><i class=\"fa fa-plus\"></i></a>"}%';
            my $encComment = Foswiki::urlEncode($cset->{comment});
            $addComment =~ s#\$encComment#$encComment#g;
            $editComment = '<div class="icons"><a href="#" class="task-changeset-edit" title="%MAKETEXT{"Edit comment"}%"><i class="fa fa-pencil"></i></a><a href="#" class="task-changeset-remove" title="%MAKETEXT{"Remove comment"}%"><i class="fa fa-times"></i></a></div>' if $cset->{comment};
        }

        $format =~ s#\$addComment#$addComment#g;
        $format =~ s#\$icons#$editComment#g;
    }

    my ($defaultFFormat, $defaultFAddFormat, $defaultFDeleteFormat);
    if ( $plain ) {
        $defaultFFormat = <<FORMAT;
%MAKETEXT{"Field [_1] changed:" args="\$title"}% \$old(shorten:25) -> \$new(shorten:25)
FORMAT
        $defaultFAddFormat = <<FORMAT;
%MAKETEXT{"[_1] added: [_2]" args="\$title,\$new(shorten:25)"}%
FORMAT
        $defaultFDeleteFormat = <<FORMAT;
%MAKETEXT{"[_1] removed: [_2]" args="\$title,\$old(shorten:25)"}%
FORMAT
    } else {
        $defaultFFormat = '<li><strong>$title</strong>: <del>$old(shorten:140)</del> &#8594; <ins>$new(shorten:140)</ins>';
        $defaultFAddFormat = '<li>%MAKETEXT{"[_1] added: [_2]" args="<strong>$title</strong>,$new(shorten:140)"}%</li>';
        $defaultFDeleteFormat = '<li>%MAKETEXT{"[_1] removed: [_2]" args="<strong>$title</strong>,$old(shorten:140)"}%</li>';
    }
    my $fformat = $params->{fieldformat} || $defaultFFormat;
    my $faddformat = $params->{fieldaddformat} || $defaultFAddFormat;
    my $fdeleteformat = $params->{fielddeleteformat} || $defaultFDeleteFormat;
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

        my $changeOld = $change->{old} || '';
        my $changeNew = $change->{new} || '';
        if ( $f->{type} =~ /date2?/ ) {
            $changeOld = Foswiki::Time::formatTime($changeOld, $params->{timeformat} || '$day $month $year') if $changeOld =~ /^\d+$/;
            $changeNew = Foswiki::Time::formatTime($changeNew, $params->{timeformat} || '$day $month $year') if $changeNew =~ /^\d+$/;
            $changeOld =~ s/([A-Za-z]+)/%MAKETEXT{"$1"}%/;
            $changeNew =~ s/([A-Za-z]+)/%MAKETEXT{"$1"}%/;
        }

        if ( $f->{type} =~ /^select/ ) {
            $changeOld =~ s/([A-Za-z]+)/%MAKETEXT{"$1"}%/;
            $changeNew =~ s/([A-Za-z]+)/%MAKETEXT{"$1"}%/;
        }

        if ( $f->{type} eq 'user') {
            $changeOld = _getDisplayName($changeOld);
            $changeNew = _getDisplayName($changeNew);
        }

        if ( $f->{type} eq 'user+multi') {
            $changeOld = join(', ', map {_getDisplayName($_)} split(',', $changeOld));
            $changeNew = join(', ', map {_getDisplayName($_)} split(',', $changeNew));
        }

        $out =~ s#\$name#$f->{name}#g;
        $out =~ s#\$type#$change->{type}#g;
        $out =~ s#\$title#_translate($meta, $f->{description} || $f->{tooltip} || '') || $f->{name}#eg;
        $out =~ s#\$old\(shorten:(\d+)\)#_shorten($changeOld, $1)#eg;
        $out =~ s#\$new\(shorten:(\d+)\)#_shorten($changeNew, $1)#eg;
        $out =~ s#\$old(\(\))?#$change->{old}#g;
        $out =~ s#\$new(\(\))?#$change->{new}#g;
        push @fout, $out;
    }
    if ( $changes->{_attachment}) {
        my $change = $changes->{_attachment};
        my $out = $change->{type} eq 'add' ? $faddformat : $fdeleteformat;
        $out =~ s#\$title#_translate($meta, "Attachment")#eg;
        $out =~ s#\$new\(shorten:(\d+)\)#_shorten($change->{new}, $1)#eg;
        $out =~ s#\$old\(shorten:(\d+)\)#_shorten($change->{old}, $1)#eg;
        push @fout, $out;
    }

    return '' unless ( @fout || $cset->{comment} );
    my $out = $format;
    $out =~ s#\$id#$cset->{name}#g;
    $out =~ s#\$user#$cset->{actor}#g;
    $out =~ s#\$displayuser#_getDisplayName($cset->{actor})#eg;
    $out =~ s#\$date#Foswiki::Time::formatTime($cset->{at}, $params->{timeformat})#eg;
    $out =~ s#\$fields#join($fsep, @fout)#eg;
    $out =~ s#\$comment#$cset->{comment} || ''#eg;
    $out;
}

sub _shorten {
    my ($text, $len) = @_;
    return $text unless defined $len;
    $text =~ s/<.+?>//g;
    $text = Encode::decode($Foswiki::cfg{Site}{CharSet}, $text) if Encode::is_utf8($text) && !$Foswiki::UNICODE;
    $text = substr($text, 0, $len - 3) ."..." if length($text) > ($len + 3); # a bit of fuzz
    Encode::encode($Foswiki::cfg{Site}{CharSet}, $text) if Encode::is_utf8($text) && !$Foswiki::UNICODE;
    return $text;
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
                $val = substr $val, 0, 10 if ( length $val eq 13 );
                $val = Foswiki::Time::formatTime($val, $params->{format});
            }

            $val =~ s/([^\d\s:\(\)]+)/%MAKETEXT\{$1\}%/;
        }
        if (Foswiki::isTrue($params->{user}, 0)) {
            my @vals = ();
            my $f = $task->form->getField($field);
            if (defined $f && $f->{type} =~ /\+multi/) {
                @vals = split(/,\s?/, $val);
            } else {
                push @vals, $val;
            }

            foreach my $v (@vals) {
                unless(grep(/$v/, $currentOptions->{autouser})) {
                    my $tmp = $v;
                    $v = _getDisplayName($v) if $v;
                    $v = $tmp unless $v;
                }
            }

            $val = join(',', @vals);
        }
        if (Foswiki::isTrue($params->{escape}, 0)) {
            $val =~ s/&/&amp;/g;
            $val =~ s/</&lt;/g;
            $val =~ s/>/&gt;/g;
            $val =~ s/"/&quot;/g;
        }
        if (Foswiki::isTrue($params->{nohtml}, 0)) {
            $val =~ s|<.+?>||g;
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
    if ($params->{type} && $params->{type} eq 'attachments') {
        my @out;
        foreach my $attachment (sort { $a->{name} cmp $b->{name} } $task->{meta}->find('FILEATTACHMENT')) {
            my $out = _renderAttachment($topicObject, $task, $attachment, $params);
            push @out, $out if $out ne '';
        }
        my $header = $params->{header} || '<table class="task-attachments"><thead><tr><th>&nbsp;</th><th class="created">%MAKETEXT{"Created"}%</th><th class="name">%MAKETEXT{"Name"}%</th><th class="size">%MAKETEXT{"Size"}%</th><th></th></tr></thead></tbody>';
        my $footer = $params->{footer} || '</tbody></table>';
        return $header . join($params->{separator} || "\n", @out) . $footer;
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
            local $storedTemplates;
            my $json = to_json(_enrich_data($task, 'tasksapi::empty'));
            $json =~ s/&/&amp;/g;
            $json =~ s/</&lt;/g;
            $json =~ s/>/&gt;/g;
            $json =~ s/"/&quot;/g;
            $json =~ s/%/&#37;/g;
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

    unless ($indexerCalled) {
        $indexerCalled = 1;
        my $session = $Foswiki::Plugins::SESSION;

        my $req = $session->{request};
        my $param = $req->param('taskindex');
        if ($param && Foswiki::Func::isAnAdmin($session->{user})) {
            my $tweb = $Foswiki::cfg{TasksAPIPlugin}{DBWeb} || 'Tasks';
            if ($param =~ /^$tweb\.Task-\w+$/) {
                eval {
                    my ($w, $t) = Foswiki::Func::normalizeWebTopicName(undef, $param);
                    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($w, $t);
                    _index($task);
                };
            } elsif ($param =~ /^full$/i) {
                eval {
                    _fullindex(1);
                };
            }
        }
    }
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
