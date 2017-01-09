# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Time ();

use Foswiki::Plugins::AmpelPlugin;
use Foswiki::Plugins::JQueryPlugin;
use Foswiki::Plugins::SolrPlugin;
use Foswiki::Plugins::TasksAPIPlugin::Task;
use Foswiki::Plugins::TasksAPIPlugin::Job;

use DBI;
use Encode;
use File::MimeInfo;
use HTML::Entities;
use JSON;
use Number::Bytes::Human qw(format_bytes);
use POSIX;
use Digest::MD5 qw(md5_hex);

our $VERSION = '0.2';
our $RELEASE = '0.2';
our $SHORTDESCRIPTION = 'API and frontend for managing assignable tasks';
our $NO_PREFS_IN_TOPIC = 1;

my $db;
my %schema_versions;
my %tmpWikiACLs;
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
    [
        # Distinguish task types for exotic features like template tasks
        "ALTER TABLE tasks ADD COLUMN topictype TEXT NOT NULL DEFAULT 'task'",
    ],
);
my %singles = (
    id => 1,
    form => 1,
    Context => 1,
    Parent => 1,
    TopicType => 1,
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

    # Implementation moved to AmpelPlugin.
    # Still here for compatibility reasons.
    Foswiki::Func::registerTagHandler( 'TASKSAMPEL', \&Foswiki::Plugins::AmpelPlugin::_SIGNALTAG );

    Foswiki::Func::registerTagHandler( 'TASKSGRID', \&tagGrid );
    Foswiki::Func::registerTagHandler( 'TASKGRID', \&tagTaskGrid);
    Foswiki::Func::registerTagHandler( 'TASKSSEARCH', \&tagSearch );
    Foswiki::Func::registerTagHandler( 'TASKSTYPEFILTER', \&tagTaskTypeFilter );
    Foswiki::Func::registerTagHandler( 'TASKSFILTER', \&tagFilter );
    Foswiki::Func::registerTagHandler( 'TASKINFO', \&tagInfo );
    Foswiki::Func::registerTagHandler( 'TASKCONTEXTSELECTOR', \&tagContextSelector );
    Foswiki::Func::registerTagHandler( 'MAKEDATE', \&makeDate );

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
    Foswiki::Func::registerRESTHandler( 'link', \&restLink, %restopts );
    Foswiki::Func::registerRESTHandler( 'permalink', \&restLink, %restopts );

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
    $storedTemplates = {};
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

sub afterRenameHandler {
    my ( $oldWeb, $oldTopic, $oldAttachment, $newWeb, $newTopic, $newAttachment ) = @_;
    return if $oldWeb eq $newWeb && $oldTopic eq $newTopic;

    return if $oldAttachment || $newAttachment;

    # Context topic moved
    if ($oldTopic && $newTopic) {
        ($oldWeb, $oldTopic) = Foswiki::Func::normalizeWebTopicName($oldWeb, $oldTopic);
        ($newWeb, $newTopic) = Foswiki::Func::normalizeWebTopicName($newWeb, $newTopic);
        my $query = {
            Context => "$oldWeb.$oldTopic"
        };

        Foswiki::Func::setPreferencesValue('tasksapi_suppress_logging', '1');
        my $res = _query(query => $query, count => -1);
        my $tasks = $res->{tasks};
        foreach my $task (@$tasks) {
            my %data = (Context => "$newWeb.$newTopic");
            $data{Status} = 'deleted' if $newWeb eq $Foswiki::cfg{TrashWebName};
            $task->update(%data);
        }

        Foswiki::Func::setPreferencesValue('tasksapi_suppress_logging', '0');
        return;
    }

    # Context web moved
    ($oldWeb) = Foswiki::Func::normalizeWebTopicName($oldWeb, $oldTopic);
    ($newWeb) = Foswiki::Func::normalizeWebTopicName($newWeb, $newTopic);

    # It might happen that the form is not updated by Foswiki yet.
    # Using TasksAPI's query method will fail in that case.
    my $solr = Foswiki::Plugins::SolrPlugin::getSearcher();
    my $search = $solr->entityDecode("type:task container_id:${oldWeb}*", 1);
    my $raw = $solr->solrSearch($search)->{raw_response};
    my $content = from_json($raw->{_content});
    my $r = $content->{response};

    Foswiki::Func::setPreferencesValue('tasksapi_suppress_logging', '1');
    foreach my $doc (@{$r->{docs}}) {
        my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName(undef, $doc->{task_id_s});
        my ($meta) = Foswiki::Func::readTopic($tweb, $ttopic);
        my $fname = $meta->getFormName();
        my ($fweb, $ftopic) = Foswiki::Func::normalizeWebTopicName(undef, $fname);
        my $form = new Foswiki::Form($Foswiki::Plugins::SESSION, $newWeb, $ftopic);

        $meta->merge($meta, $form);
        $meta->saveAs($tweb, $ttopic, {dontlog => 1, ignorepermissions => 1});
        $meta->finish();

        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($tweb, $ttopic);
        my $ctx = $task->{fields}{Context};
        my ($cweb, $ctopic) = Foswiki::Func::normalizeWebTopicName(undef, $ctx);
        my %data = (Context => "$newWeb.$ctopic");
        $data{Status} = 'deleted' if $newWeb =~ /^$Foswiki::cfg{TrashWebName}/;
        $task->update(%data);
        _index($task);
    }

    Foswiki::Func::setPreferencesValue('tasksapi_suppress_logging', '0');
}

sub beforeSaveHandler {
    my ($text, $topic, $web, $meta) = @_;

    my $solr = Foswiki::Plugins::SolrPlugin::getSearcher();
    my $search = $solr->entityDecode('topic:*Form text:"$wikiACL"', 1);
    my $raw = $solr->solrSearch($search)->{raw_response};
    $tmpWikiACLs{solrStatus} = $raw->{_rc};
    return unless $raw->{_rc} == 200;

    my ($oldMeta) = Foswiki::Func::readTopic($web, $topic);
    $tmpWikiACLs{acls} = {
        ALLOWTOPICVIEW   => $oldMeta->getPreference('ALLOWTOPICVIEW'),
        ALLOWTOPICCHANGE => $oldMeta->getPreference('ALLOWTOPICCHANGE'),
        DENYTOPICVIEW    => $oldMeta->getPreference('DENYTOPICVIEW'),
        DENYTOPICCHANGE  => $oldMeta->getPreference('DENYTOPICCHANGE')
    };

    my $content = from_json($raw->{_content});
    my $r = $content->{response};
    return unless $r->{numFound};

    my @forms;
    foreach my $doc (@{$r->{docs}}) {
        my ($formMeta) = Foswiki::Func::readTopic(
            Foswiki::Func::normalizeWebTopicName(undef, $doc->{webtopic})
        );

        my $aclView = $formMeta->getPreference('TASKACL_VIEW');
        my $aclChange = $formMeta->getPreference('TASKACL_CHANGE');
        if ($aclView =~ /\$wikiACL\($web\.$topic/) {
            push @forms, $doc->{webtopic};
        } elsif ($aclChange =~ /\$wikiACL\($web\.$topic/) {
            push @forms, $doc->{webtopic};
        }
    }

    $tmpWikiACLs{forms} = \@forms;
}


sub afterSaveHandler {
    my ( $text, $topic, $web, $error, $meta ) = @_;

    # If we're dealing with a save from a template topic that contains template
    # tasks, copy them
    my $templatetopic = $Foswiki::Plugins::SESSION->{request}->param('templatetopic');
    if ($templatetopic) {
        my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName($web, $templatetopic);
        my $res = _query(query => {Context => "$tweb.$ttopic", TopicType => 'task-prototype'});
        return unless defined $res && @{$res->{tasks}};

        # Tasks are sorted such that tasks without parents are copied first.
        # This ensures that their new id can be set as the parent on copied
        # child tasks.
        my @stasks = sort { $a->{fields}{Parent} cmp $b->{fields}{Parent} } @{$res->{tasks}};
        my $newTasksMapping = {};
        foreach my $t (@stasks) {
            if ($t->{fields}{Parent} && $t->{fields}{Parent} ne '') {
                $t->copy(
                    context => "$web.$topic",
                    form => $t->getPref('INSTANTIATED_FORM'),
                    type => 'task',
                    fields => {
                        Parent => $newTasksMapping->{$t->{fields}{Parent}}->{id},
                    },
                );
            } else {
                $newTasksMapping->{$t->{id}} = $t->copy(
                    context => "$web.$topic",
                    form => $t->getPref('INSTANTIATED_FORM'),
                    type => 'task',
                );
            }
        }
    }

    # Allow applications to define some automatic task updates
    my $query = {};
    my $update = {};
    eval {
        $query = from_json($Foswiki::Plugins::SESSION->{request}->param('taskquery') || "{}");
        $update = from_json($Foswiki::Plugins::SESSION->{request}->param('taskupdate') || "{}");
    };
    if(%$query and %$update){
        my $res = _query(query => $query);
        foreach my $t (@{$res->{tasks}}) {
            if($t->checkACL('change')){
                $t->update(%$update);
            }
        }
    }

    # Index
    return unless $tmpWikiACLs{solrStatus} && $tmpWikiACLs{solrStatus} == 200;

    my $skipIndex = 0;
    foreach my $key (keys %{$tmpWikiACLs{acls}}) {
        my $topicPref = $meta->getPreference($key);
        $topicPref = '' unless defined $topicPref;
        my $wikiPref = $tmpWikiACLs{acls}->{$key};
        $wikiPref = '' unless defined $wikiPref;
        $skipIndex = $wikiPref ne $topicPref;
        last if $skipIndex;
    }

    unless ($skipIndex) {
        undef %tmpWikiACLs;
        return;
    }

    my $indexer = Foswiki::Plugins::SolrPlugin::getIndexer();

    # First, look for tasks in the current context
    my $res = _query(acl => 0, query => {Context => "$web.$topic"});
    if (defined $res->{tasks}) {
        foreach my $task (@{$res->{tasks}}) {
            $task->solrize(
                $indexer,
                $Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration}
            );
        }
    }

    # If one or more $wikiACL were present within a task form,
    # process them as well
    unless (defined $tmpWikiACLs{forms}) {
        undef %tmpWikiACLs;
        return;
    }

    foreach my $form (@{$tmpWikiACLs{forms}}) {
        $res = _query(acl => 0, query => {form => "$form"});
        if (defined $res->{tasks}) {
            foreach my $task (@{$res->{tasks}}) {
                $task->solrize(
                    $indexer,
                    $Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration}
                );
            }
        }
    }

    undef %tmpWikiACLs;
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
    $query->{TopicType} ||= 'task';

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
            if ($order eq $q) {
                $order = "$t.value";
                $joins{$order} = 1; # make sure we don't add this join again for ordering
            }
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

    if ($order) {
        my $isArray = ref($order) eq 'ARRAY';
        if ($isArray) {
            my @orders = ();
            foreach my $o (@$order) {
                while ( my ($k, $v) = each %$o ) {
                    if (!$singles{$k}) {
                        my $t = "$k";
                        $t = "j_$t" unless $t =~ /^j_/;
                        $join .= " LEFT JOIN task_multi $t ON(t.id = $t.id AND $t.type='$k')";
                        $k = "$t";
                        $k .= ".value" unless $order =~ /\.value$/;
                    }
                    push(@orders, "$k COLLATE NOCASE" . ($v ? ' DESC' : ''));
                }
            }
            $order = " ORDER BY " . join(', ', @orders);
        } elsif (!$singles{$order} && !$joins{$order}) {
            my $t = "$order";
            $t = "j_$t" unless $t =~ /^j_/;
            $join .= " LEFT JOIN task_multi $t ON(t.id = $t.id AND $t.type='$order')";
            $order = "$t";
            $order .= ".value" unless $order =~ /\.value$/;
        }

        if (!$isArray) {
            $order = " ORDER BY $order COLLATE NOCASE" if $order && $order =~ /^[\w.]+$/;
            $order .= " DESC" if $order && $opts{desc};
        }
    }
    my ($limit, $offset, $count) = ('', $opts{offset} || 0, $opts{count});
    $limit = " LIMIT $offset, $count" if $count;
    my $group = '';
    $group = ' GROUP BY t.id' if $join;
    my $ids = db()->selectall_arrayref("SELECT t.id, raw FROM tasks t$join$filter$group$order$limit", {}, @args);
    my $total = db()->selectrow_array("SELECT count(*) FROM tasks t$join$filter", {}, @args);

    return {tasks => [], total => 0} unless @$ids;
    my @tasks = map {
        my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, $_->[0]);
        my $task = Foswiki::Plugins::TasksAPIPlugin::Task::_loadRaw($tweb, $ttopic, $_->[1]);
        $task->{_canChange} = $task->checkACL('change');
        $task
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

    require Foswiki::Plugins::SolrPlugin;
    my $indexer = Foswiki::Plugins::SolrPlugin::getIndexer();
    $indexer->deleteByQuery('task_id_s:*');

    foreach my $t (Foswiki::Plugins::TasksAPIPlugin::Task::loadMany()) {
        print $t->{id} ."\n" unless $noprint;
        _index($t, 0);
        next if $t->{fields}{TopicType} ne 'task';
        $t->solrize($indexer, $Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration});
    }

    $db->commit;
    $indexer->commit();
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
        $response->body(encode_json({
            status => 'error',
            'code' => 'client_error',
            msg => "Request error: Missing filename or task id parameter."
        }));
        return '';
    }

    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $id);
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    unless ($task->checkACL('view')) {
        $response->header(-status => 403);
        $response->body(encode_json({
            status => 'error',
            code => 'acl_view',
            msg => 'No permission to download files from this task'
        }));
        return '';
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
        $response->body(encode_json({
            status => 'error',
            'code' => 'server_error',
            msg => "Server error: $@"
        }));
    }

    return '';
}

sub restDelete {
    my ( $session, $subject, $verb, $response ) = @_;

    my $q = $session->{request};
    my $id = $q->param('id') || '';
    my $file = $q->param('file') || '';

    unless ($id && $file) {
        $response->header(-status => 400);
        $response->body(encode_json({
            status => 'error',
            'code' => 'client_error',
            msg => "Request error: Missing filename or task id parameter."
        }));
        return '';
    }

    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $id);
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($web, $topic);
    unless ($task->checkACL('change')) {
        $response->header(-status => 403);
        $response->body(encode_json({
            status => 'error',
            code => 'acl_change',
            msg => 'No permission to remove attachments of this task'
        }));
        return '';
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
        actor => $session->{user},
        at => scalar(time),
        changes => encode_json(\@changes)
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
        $response->body(encode_json({
            status => 'error',
            code => 'acl_change',
            msg => 'No permission to attach files to this task'
        }));
        return '';
    }

    eval {
        my $q = Foswiki::Func::getCgiQuery();
        my $stream = $q->upload('filepath');
        unless ($stream) {
            $response->header(-status => 405);
            $response->body(encode_json({
                status => 'error',
                code => 'server_error',
                msg => 'Attachment has zero size'
            }));
            return '';
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

        my $newid;
        my @changesets = $task->{meta}->find('TASKCHANGESET');
        if(@changesets) {
            my @ids = sort {$a <=> $b} (map {int($_->{name})} @changesets);
            $newid = 1 + pop(@ids);
        } else {
            $newid = 1;
        }

        my @changes = ({type => 'add', name => '_attachment', new => $name});
        $task->{meta}->putKeyed('TASKCHANGESET', {
            name => $newid,
            actor => $session->{user},
            at => scalar(time),
            changes => encode_json(\@changes)
        });

        $task->{meta}->saveAs($web, $topic, dontlog => 1, minor => 1);
        Foswiki::Plugins::TasksAPIPlugin::_index($task);
        $task->{changeset} = $newid;
        $task->notify('changed');
    };
    if ($@) {
        Foswiki::Func::writeWarning( $@ );
        $response->header(-status => 500);
        $response->body(encode_json({
            status => 'error',
            'code' => 'server_error',
            msg => "Server error: $@"
        }));
        return '';
    }

    my ($date, $user, $rev, $comment) = Foswiki::Func::getRevisionInfo($web, $topic, 0, $name);
    $response->header(-status => 200);
    $response->body(encode_json({
        status => 'ok',
        filedate => $date,
        filerev => $rev
    }));
    return '';
}

sub _optionsFromRest {
    my ($session) = shift;
    my $q = $session->{request};
    my @fields = (qw(
        context parent form id depth pagesize paging offset
        query order desc columns headers allowupload keepclosed
        sortable templatefile tasktemplate editortemplate
        autoassign autoassignTarget autouser
        titlelength updateurl
        _baseweb _basetopic
    ));
    my $res = {};
    for my $f (@fields) {
        $res->{$f} = $q->param($f) if defined $q->param($f);
    }
    $res;
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
        my $templatefile = $q->param('templatefile');
        $templatefile =~ s#/#.#g;
        Foswiki::Func::loadTemplate( $templatefile );
    }

    $response->header(-status => 200);
    my $task = _enrich_data($res, _optionsFromRest($session));
    amendDisplayValues($session, $task);
    $response->body(encode_json({
        status => 'ok',
        id => $res->{id},
        data => $task,
    }));
    return '';
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
        $response->header(-status => 403);
        $response->body('{"status":"error","code":"acl_change","msg":"No permission to update task"}');
        return '';
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
    $response->header(-status => 200);
    $task = _enrich_data($task, _optionsFromRest($session));
    amendDisplayValues($session, $task);
    $response->body(encode_json({
        status => 'ok',
        data => $task,
    }));
    return '';
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
        $res{$id} = {status => 'ok', data => _enrich_data($task, _optionsFromRest($session))};
    }
    $response->body(encode_json(\%res));
    return '';
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
    my $options = shift;

    my $d = $task->data;
    my $fields = $d->{form}->getFields;
    my @childtasks = [];
    my @changesets = $task->{meta}->find('TASKCHANGESET');
    if($options->{childtasks} && $task->{children_acl} ){
        @childtasks = map { _enrich_data($_, $options) } @{$task->{children_acl}}
    }
    my $result = {
        id => $d->{id},
        depth => $task->{_depth},
        children => \@childtasks,
        form => $d->{form}->web .'.'. $d->{form}->topic,
        attachments => [$task->{meta}->find('FILEATTACHMENT')],
        fields => {},
        changesets => [],
        tasktype => $task->getPref('TASK_TYPE'),
        childform => $task->getPref('CHILD_FORM')
    };
    foreach my $c (@changesets) {
        my $cc = {
            name => $c->{name},
            user => {
                cuid => $c->{actor},
                wikiusername => Foswiki::Func::getWikiUserName($c->{actor}),
                wikiname => Foswiki::Func::getWikiName($c->{actor}),
                loginname => Foswiki::Func::wikiToUserName($c->{actor})
            },
            actor => $c->{actor},
            at => $c->{at},
            changes => $c->{changes}
        };
        if($c->{comment}) {
            $cc->{comment} = $c->{comment};
        }
        push ($result->{changesets}, $cc);
    }
    foreach my $f (@$fields) {
        next if $f->{name} eq 'TopicType';
        my $ff = {
            name => $f->{name},
            multi => $f->isMultiValued ? JSON::true : JSON::false,
            mapped => $f->can('isValueMapped') ? ($f->isValueMapped ? JSON::true : JSON::false) : JSON::false,
            tooltip => _translate($task->{meta}, $f->{tooltip} || ''),
            description => _translate($task->{meta}, $f->{description} || ''),
            mandatory => $f->isMandatory ? JSON::true : JSON::false,
            hidden => ($f->{attributes} =~ /H/) ? JSON::true : JSON::false,
            type => $f->{type},
            size => $f->{size},
            attributes => $f->{attributes},
            options => $f->can('getOptions') ? $f->getOptions() : "",
            map => $f->{valueMap} ? $f->{valueMap} : "",
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

    if($options){
        $result->{html} = _renderTask($task->{meta}, $options, $task);
        $result->{html} = _removeBlocks($result->{html});
    }
    $result->{_canChange} = $task->{_canChange};
    $result->{_canChange} = 1 unless defined $result->{_canChange};

    return $result;
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
        my $templatefile = $params->{templatefile};
        $templatefile =~ s#/#.#g;
        Foswiki::Func::loadTemplate( $templatefile );
    }

    my @res = map { _enrich_data($_, { tasktemplate => $params->{tasktemplate} }) } @{$res->{tasks}};
    return to_json({status => 'ok', data => \@res});
}

sub tagTaskTypeFilter {
    my($session, $params, $topic, $web, $topicObject) = @_;

    my $query = $currentOptions->{query} || '{}';
    if ($query) {
        $query = from_json($query);
    }

    my $res = _query($query, 0);
    my @types = map {
        $_->{fields}{Type}
    } @{$res->{tasks}};

    my @unique;
    foreach my $type (@types) {
        push @unique, $type unless grep(/$type/, @unique);
    }

    return join(',', @unique);
}

sub tagFilter {
    my( $session, $params, $topic, $web, $meta ) = @_;
    my $filter = $params->{_DEFAULT} || $params->{field} || '';
    return '' unless $filter;

    my $sys = $Foswiki::cfg{SystemWebName} || 'System';
    my $ftopic = $params->{form} || $currentOptions->{form};
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

    my $query = $currentOptions->{query} || '{}';
    if ($query) {
        $query = from_json($query);
    }

    my $form = Foswiki::Form->new($session, Foswiki::Func::normalizeWebTopicName(undef, $ftopic) );
    my $fields = $form->getFields;
    my @html = ('<div>');

    my $isSelected = sub {
        return 'selected="selected" data-default="1"' if defined $_[0] && defined $_[1] && $_[0] eq $_[1];
        return '';
    };

    foreach my $f (@$fields) {
        next unless $f->{name} eq $filter;
        my @out = ();
        $title = $f->{title} || $f->{name} unless $title;
        push(@out, "<span class=\"hint\">%MAKETEXT{\"$title\"}%:</span>") unless $f->{type} =~ /^user/;

        if ($f->{type} =~ /^date2?$/) {
            my $dmin = ($minfrom || $min) ? "data-min=\"" . ($minfrom || $min) . "\"" : '';
            my $dmax = ($maxfrom || $max) ? "data-max=\"" . ($maxfrom || $max) . "\"" : '';
            push(@out, "<input type=\"text\" name=\"${filter}-from\" $dmin $dmax class=\"filter foswikiPickADate\" />");
            if ($isrange) {
                $dmin = ($minto || $min) ? "data-min=\"" . ($minto || $min) . "\"" : '';
                $dmax = ($maxto || $max) ? "data-max=\"" . ($maxto || $max) . "\"" : '';
                push(@out, "<span>-</span>");
                push(@out, "<input type=\"text\" name=\"${filter}-to\" $dmin $dmax class=\"filter foswikiPickADate\" />");
            }
        } elsif ($f->{type} =~ /^text$/) {
            my $value = $query->{$filter} ? "value=\"$query->{$filter}\"" : '';
            my $default = $value ? 'data-default="' . $query->{$filter} . '"' : '';
            push(@out, "<input type=\"text\" name=\"${filter}-like\" class=\"filter\" $value $default />");
        } elsif ($f->{type} =~ /^select/) {
            push(@out, "<select name=\"$filter\" class=\"filter\">");
            my @opts = ();
            my @labels = ();
            my @arr = split(',', $f->{value});
            next if(scalar @arr < 2 );
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

            my $selected = '';
            my $hasSelected = 0;
            my @options = ();
            if ( scalar @opts eq scalar @labels) {
                for (my $i=0; $i < scalar @opts; $i++) {
                    my $val = $opts[$i];
                    $val =~ s/(^\s*)|(\s*$)//g;
                    my $label = $labels[$i];
                    $label =~ s/(^\s*)|(\s*$)//g;

                    $selected = $isSelected->($query->{$filter}, $val);
                    $hasSelected = 1 if $selected;
                    push(@options, "<option value=\"$val\" $selected>$label</option>")
                }
            } else {
                for (my $i=0; $i < scalar @opts; $i++) {
                    my $val = $opts[$i];
                    $val =~ s/(^\s*)|(\s*$)//g;
                    $selected = $isSelected->($query->{$filter}, $val);
                    $hasSelected = 1 if $selected;
                    push(@options, "<option value=\"$val\">$val</option>")
                }
            }

            if ($hasSelected eq 0) {
                $selected = 'selected="selected" data-default="1"';
            } else {
                $selected = '';
            }

            # Assume 'all'.
            # Note: Actually we have to render a multi-select here:
            #       e.g. 'query={Status: ["closed", "deleted"]}'
            # Would also result in type 'all'

            push(@options, "<option value=\"all\" $selected>%MAKETEXT{\"all\"}%</option>");
            push(@out, @options);
            push(@out, "</select>");
        } elsif ($f->{type} =~ /^user$/) {
            my $macro = <<MACRO;
%RENDERFOREDIT{form="$ftopic" fields="$f->{name}" format="<span class='hint' style='margin-right: -2px; margin-bottom: 3px;'>\$xlatedescription</span> \$edit" header="" footer=""}%
MACRO
            push(@out, $macro);
        } elsif ($f->{type} =~ /^user\+multi$/) {
            # ToDo
        }
        push(@html, @out);
    }

    push(@html, '</div>');
    join('', @html);
}

sub restSearch {
    my ($session, $subject, $verb, $response) = @_;
    my $res;
    my $req;
    my $q = $session->{request};
    my $noHtml = $session->{request}->param('noHtml') || "";
    my $limit = $session->{request}->param('limit') || 9999;
    my $offset = $session->{request}->param('offset') || 0;
    my $order = $session->{request}->param('order') || '';
    my $desc = $session->{request}->param('desc') || '';
    my $depth = $session->{request}->param('depth') || 0;

    eval {
        $req = from_json($q->param('request') || '{}');
        delete $req->{acl};
        $res = _query(query => $req, count => $limit, offset => $offset, order => $order, desc => $desc);
    };
    if ($@) {
        $response->header(-status => 500);
        $response->body(encode_json({status => 'error', 'code' => 'server_error', msg => "Server error: $@"}));
        return '';
    }

    #my $depth = $req->{depth} || 0;
    $res->{tasks} = _deepen($res->{tasks}, $depth, $req->{order});
    my $enrichOptions;
    if ($noHtml) {
        $enrichOptions = { childtasks => 1 };
    } else {
        $enrichOptions = { tasktemplate => $req->{tasktemplate} };
    }
    my @tasks = map { _enrich_data($_, $enrichOptions) } @{$res->{tasks}};
    foreach my $task (@tasks){
        amendDisplayValues($session, $task);
    }
    $response->header(-status => 200);
    $response->body(encode_json({status => 'ok', data => \@tasks, total => $res->{total}}));
    return '';
}

sub amendDisplayValues {
    my ( $session, $task) = @_;
    if($task && $task->{children} && ref($task->{children}[0]) ne 'ARRAY') {
        foreach my $childTask (@{ $task->{children} }) {
            amendDisplayValues($session, $childTask);
        }
    }
    foreach my $key (keys %{$task->{fields}}){
        if($task->{fields}->{$key}->{type} eq 'user'){
            $task->{fields}->{$key}->{displayValue} = _getDisplayName($task->{fields}->{$key}->{value});
        } else {
            my $displayValue = _getDisplayValue( $session, $task->{form}, $key, $task->{fields}->{$key}->{value});
            if($displayValue) {
                $task->{fields}->{$key}->{displayValue} = $displayValue;
            }
        }
    }
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
                unless ($cuid eq $ccuid) {
                    $response->header(-status => 403) ;
                    $response->body(encode_json({status => 'error', code=> 'lease_taken', msg => "Lease taken by another user"}));
                    return '';
                }
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
        my $f = $r->{form};
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
    my $templatefile = $r->{templatefile} || $tplfile || 'TasksAPIDefault';
    $templatefile =~ s#/#.#g;
    Foswiki::Func::loadTemplate( $templatefile );
    my $editor = Foswiki::Func::expandTemplate( $r->{editortemplate} || $edtpl || 'tasksapi::editor' );
    $editor = $meta->expandMacros( $editor );

    my @scripts = _getZone($session, $web, $topic, $meta, 'script');
    my @styles = _getZone($session, $web, $topic, $meta, 'head');

    $editor = _removeBlocks($editor);
    $response->header(-status => 200);
    $response->body(encode_json({status => 'ok', editor => $editor, scripts => \@scripts, styles => \@styles}));
    return '';
}

sub _removeBlocks {
    my $text = shift;

    my $removed = {};
    my @blocks = ('literal', 'noautolink');
    foreach my $block (@blocks) {
        $text = Foswiki::takeOutBlocks($text, $block, $removed);
        Foswiki::putBackBlocks(\$text, $removed, $block, '');
    }

    $text;
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

    unless ($r->{id}) {
        $response->header(-status => 200);
        $response->body(encode_json({status => 'ok'}));;
        return '';
    }

    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load(Foswiki::Func::normalizeWebTopicName(undef, $r->{id}));

    my $lease = $task->{meta}->getLease();
    if ( $lease ) {
        my $cuid = $lease->{user};
        my $ccuid = $session->{user};

        if ( $cuid eq $ccuid ) {
            $task->{meta}->clearLease();
            $response->header(-status => 200);
            $response->body(encode_json({status => 'ok'}));
            return '';
        }
    }

    $response->body(encode_json({status => 'error', 'code' => 'clear_lease_failed', msg => "Could not clear lease"}));
    return '';
}

sub restLink {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};

    my $id = $q->param('id');
    my $params = $q->param('params') || '';
    unless ($id) {
        throw Foswiki::OopsException(
            "oopstasknotfound",
            web => $session->{webName},
            topic => $session->{topicName},
            def => undef,
            params => ["1"]
        );
    }

    my ($tweb, $ttopic) = Foswiki::Func::normalizeWebTopicName(undef, $id);
    my $task;
    eval {
        $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($tweb, $ttopic);
    };
    if ($@) {
        throw Foswiki::OopsException(
            "oopstasknotfound",
            web => $session->{webName},
            topic => $session->{topicName},
            def => undef
        );
    }

    unless ($task->checkACL('view')) {
        throw Foswiki::OopsException(
            "oopstaskacl",
            web => $session->{webName},
            topic => $session->{topicName},
            def => undef
        );
    }
    my ($cweb, $ctopic) = Foswiki::Func::normalizeWebTopicName(undef, $task->{fields}{Context});
    my $url;

    if ($verb eq 'link') {
        if (Foswiki::Func::checkAccessPermission('VIEW', Foswiki::Func::getWikiName(), undef, $ctopic, $cweb, undef)) {
            $url = Foswiki::Func::getViewUrl($cweb, $ctopic) ."?id=$id;$params";
        } else {
            $url = Foswiki::Func::getViewUrl('Main', Foswiki::Func::getWikiName()) ."?id=$id;$params";
        }
    } elsif ($verb eq 'permalink') {
        my $state = $task->{fields}{Status} || '';
        my $assignee = $task->{fields}{AssignedTo} || '';
        my @informees = split(/\s*,\s*/, $task->{fields}{Informees} || '');
        my $login = Foswiki::Func::wikiToUserName(Foswiki::Func::getWikiName());
        $login = 'BaseUserMapping_333' if $login eq 'admin';
        $login = 'BaseUserMapping_666' if $login eq 'guest';
        my $author = $task->{fields}{Author} || '';
        if ($author eq $login) {
            $params = "tid=taskgrid_own;tab=tasks_own";
        } elsif($assignee eq $login) {
            $params = "tid=taskgrid_open;tab=tasks_open" if $state eq 'open';
            $params = "tid=taskgrid_closed;tab=tasks_closed" if $state eq 'closed';
        } elsif (grep(/^$login$/, @informees)) {
            $params = "tid=taskgrid_inform;tab=tasks_inform";
        } else {
            # User is neither author, assignee, nor any informee.
            # Check whether the user can access the context...
            if (Foswiki::Func::checkAccessPermission('VIEW', Foswiki::Func::getWikiName(), undef, $ctopic, $cweb, undef)) {
                $params = "tab=all;tid=all";
                $url = Foswiki::Func::getViewUrl($cweb, $ctopic) ."?id=$id;$params";
            } else {
                # ... if not, decline view.
                $params = "type=invalid";
            }
        }

        $url = Foswiki::Func::getViewUrl('Main', Foswiki::Func::getWikiName()) ."?id=$id;$params" unless $url;
    }

    Foswiki::Func::redirectCgiQuery(undef, $url) if $url;
    return '';
}


# Gets a rendered version of a task
sub _renderTask {
    my ($meta, $settings, $task, $addtozone) = @_;
    if ($renderRecurse >= 16) {
        return '%RED%Error: deep recursion in task rendering%ENDCOLOR%';
    }

    $renderRecurse++;
    local $currentTask = $task;
    my $taskTemplate = $settings->{tasktemplate} || $task->getPref('TASK_TEMPLATE') || 'tasksapi::task';
    my $canChange = $task->checkACL('CHANGE');
    my $haveCtx = $Foswiki::Plugins::SESSION->inContext('task_canedit') || 0;
    my $readonly = Foswiki::Func::getContext()->{task_readonly} || 0;
    $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx + 1) if $canChange;

    if ( $task->{_depth} ne 0 ) {
        $Foswiki::Plugins::SESSION->enterContext('task_showexpander', 1);
    } else {
        $Foswiki::Plugins::SESSION->leaveContext('task_showexpander');
    }

    my $taskFullViewTemplate = $task->getPref('TASK_FULLVIEW_TEMPLATE') || 'tasksapi::details';
    local $currentExpands->{fullviewtemplate} = $taskFullViewTemplate;

    my $file = $settings->{templatefile} || $task->getPref('TASK_TEMPLATE_FILE') || 'TasksAPIDefault';
    my $type = $task->getPref('TASK_TYPE');
    my $ftype = $type . '_form';
    my $taskForm = join('.', Foswiki::Func::normalizeWebTopicName($task->{form}->web, $task->{form}->topic));
    unless ($storedTemplates->{$type}) {
        $file =~ s#/#.#g;
        Foswiki::Func::pushTopicContext($task->{form}->web, $task->{form}->topic);
        Foswiki::Func::loadTemplate($file) if $file;
        Foswiki::Func::popTopicContext();
        $storedTemplates->{$type} = Foswiki::Func::expandTemplate($taskTemplate);
        $storedTemplates->{"$ftype"} = $taskForm;
    }

    if ($storedTemplates->{"$ftype"} ne $taskForm) {
        Foswiki::Func::writeWarning(
            "Non-unique value for TASKCFG_TASK_TYPE in '$taskForm' detected! "
            . "Possible override of task templates specified in $storedTemplates->{$ftype}."
        );
    }

    if (my $css = $task->getPref('CUSTOM_CSS')) {
        _addToZone($meta, 'head', $css, $type);
    }
    if (my $js = $task->getPref('CUSTOM_JS')) {
        _addToZone($meta, 'script', $js, $type);
    }

    local $currentOptions = $settings;
    my ($renderweb, $rendertopic);
    if ($settings->{_baseweb} && $settings->{_basetopic}) {
        $renderweb = $settings->{_baseweb};
        $rendertopic = $settings->{_basetopic};
    } else {
        ($renderweb, $rendertopic) = ($task->{fields}{Context} =~ /^(.*)\.(.*)$/);
    }
    Foswiki::Func::pushTopicContext($renderweb, $rendertopic);
    $task = $meta->expandMacros($storedTemplates->{$type});
    Foswiki::Func::popTopicContext();
    $task = $meta->renderTML($task);

    if ($canChange && $haveCtx && !$readonly) {
        $Foswiki::Plugins::SESSION->enterContext('task_canedit', $haveCtx); # decrement
    } elsif ($canChange) {
        $Foswiki::Plugins::SESSION->leaveContext('task_canedit'); # remove altogether
    }
    $renderRecurse--;
    return $task;
}

sub _addToZone {
    my ($meta, $zone, $path, $id) = @_;

    my @paths = ();
    if ( $path =~ /,/ ) {
        foreach my $p (split(/,/, $path)) {
            push(@paths, $meta->expandMacros($p));
        }
    } else {
        push(@paths, $meta->expandMacros($path));
    }

    my $section = "TASKSAPI::TYPE::$id::" . ($zone eq 'head' ? 'STYLES' : 'SCRIPTS');
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
    $depth |= 0;

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

# Parses definition of grid columns into a list of fields/widgets to display
# per column, along with a definition of corresponding headers.
sub _parseGridColumns {
    my ($columns, $headers) = @_;
    my @columns = grep /\S/, map { s/^\s*|\s*$//gr } split(/,/, $columns);
    my @headers = grep /\S/, map { s/^\s*|\s*$//gr =~ s/\$comma/,/gr } split(/,/, $headers);

    my (%headerTitles, %headerSort);
    my (%colInfo, @colOrder);
    my $defaultInsertPoint = 0;

    my $findIdx = sub {
        my $el = shift;
        for (my $i = 0; $i < @colOrder; $i++) {
            return $i if $el eq $colOrder[$i];
        }
        return undef;
    };

    for my $h (@headers) {
        my ($id, $title) = split(/\s*=\s*/, $h, 2);
        my $sort = '';
        if ($title =~ /^(\w*):(.*)$/) {
            ($sort, $title) = ($1, $2);
            $title =~ s/\$colon/:/g;
        }
        $headerTitles{$id} = $title;
        $headerSort{$id} = $sort;
    }

    for my $c (@columns) {
        my ($id, $fields) = split(/\s*=\s*/, $c, 2);
        my $pos = $defaultInsertPoint;
        my $advance = 1;
        if ($id =~ /^\w+$/) {
            my $old = $findIdx->($id);
            $pos = $old if defined $old;
        }
        elsif ($id =~ /^\^(\w+)$/) {
            $pos = 0;
            $id = $1;
        } elsif ($id =~ /^(\w+)\$$/) {
            $id = $1;
            $advance = 0;
        } elsif ($id =~ /^(\w+)([<>])(\w+)$/) {
            $id = $1;
            my $ref = $findIdx->($3);
            if (defined $ref) {
                if ($ref == $pos) {
                    $advance = 2;
                } elsif ($ref > $pos) {
                    $advance = 0;
                }
                $pos = $ref;
                $pos += 1 if $2 eq '>' # insert after
            }
        } else {
            # shouldn't be reached given valid input
        }

        # if ID already existed, we're moving it, so remove old position entry
        my $existingPos = $findIdx->($id);
        if (defined $existingPos) {
            if ($existingPos < $pos) {
                $pos--;
                $defaultInsertPoint--;
            }
            @colOrder = grep { $_ ne $id } @colOrder;
        }
        next if $fields eq '$remove';

        splice @colOrder, $pos, 0, $id;
        my $info = {
            id => $id,
            fields => [split(/\s+/, $fields)],
            title => $headerTitles{$id},
            sortkey => $headerSort{$id},
        };
        if (!defined $info && $fields eq '$inherit') {
            my ($sweb, $stopic) = @{$Foswiki::Plugins::SESSION}{'webName', 'topicName'};
            Foswiki::Func::writeWarning("$sweb.$stopic: '\$inherit' used in TASKSGRID column definition where no previous definition of the same column existed");
            next;
        }
        $info = $colInfo{$id} if defined $info && $fields eq '$inherit';
        $colInfo{$id} = $info;

        $defaultInsertPoint += $advance;
    }

    return (\%colInfo, \@colOrder);
}

sub _getComponent {
    my ($value) = @_;
    my %newComponent = (
        id => $value->{id},
        title => $value->{title},
        sort_field => $value->{sortkey},
        component => {
            type => 'value',
            class => $value->{id},
            fields => $value->{fields}
        }
    );
    return \%newComponent;
}

sub tagTaskGrid {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    my $component = $params->{component} || 'standard';
    my $context = $params->{_DEFAULT} || $params->{context} || "$web.$topic";
    my $config = $params->{config} || '{}';

    my $pluginURL = '%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin';
    my $debug = $Foswiki::cfg{TasksAPIPlugin}{Debug} || 0;
    my $suffix = $debug ? '' : '.min';
    my $lang = $session->i18n->language();
    $lang = 'en' unless ( $lang =~ /^(de|en)$/);

    $config =~ s/\'/\"/g;

    my $prefs = {
        component => $component,
        config => from_json($config)
    };

    # Add custom fields
    ## Get Order from parseGridColumns
    my @defaultColumns;
    foreach my $field ( @{ $prefs->{config}->{tasktypes}->{default}->{fields} }) {
        push @defaultColumns, $field->{id} .'='.$field->{id};
    }
    my $orderColumns = join(',', @defaultColumns,$params->{columns});
    my $order = (_parseGridColumns($orderColumns , $params->{headers}))[1];

    ## Get Field infos from parseGridColumns
    my $columns = (_parseGridColumns($params->{columns} , $params->{headers}))[0];
	while ( my ($field, $value) = each $columns ) {
        my %newComponent = %{ _getComponent($value)};
        my( $index )= grep { $order->[$_] eq $value->{id} } 0..scalar @{$order};
        splice @{ $prefs->{config}->{tasktypes}->{default}->{fields} }, $index, 0, \%newComponent;
	}

    # Translate Title Fields
    while ( my ($types, $values) = each $prefs->{config}->{tasktypes}) {
        foreach my $field ( @{ $values->{fields} }) {
            my %field = %{$field};
           if($field{title}) {
                $field->{title} = $session->i18n->maketext($field{title});
           }
        }
    }

    my $prefId = md5_hex(rand);
    my $prefSelector = "TASKGRIDPREF_$prefId";
    my $jsonPrefs = to_json($prefs);

    Foswiki::Func::addToZone( 'head', 'FONTAWESOME',
        '<link rel="stylesheet" type="text/css" media="all" href="%PUBURLPATH%/%SYSTEMWEB%/FontAwesomeContrib/css/font-awesome.min.css" />');
    Foswiki::Func::addToZone( 'head', 'FLATSKIN_WRAPPED',
        '<link rel="stylesheet" type="text/css" media="all" href="%PUBURLPATH%/%SYSTEMWEB%/FlatSkin/css/flatskin_wrapped.min.css" />');
    Foswiki::Func::addToZone( 'head', 'TASKSAPI::STYLES', <<STYLE );
<link rel='stylesheet' type='text/css' media='all' href='%PUBURL%/%SYSTEMWEB%/TasksAPIPlugin/css/tasktracker.css' />
STYLE
    Foswiki::Func::addToZone( 'script', $prefSelector,
        "<script type='text/json'>$jsonPrefs</script>");

    Foswiki::Func::addToZone( 'script', 'TASKGRID',
        "<script type='text/javascript' src='%PUBURL%/%SYSTEMWEB%/TasksAPIPlugin/js/taskgrid2.js'></script>");

    Foswiki::Func::addToZone( 'script', 'TASKSAPI::I18N::TASKGRID', <<SCRIPT, 'jsi18nCore' );
<script type="text/javascript" src="$pluginURL/js/i18n/jsi18n.TaskGrid.$lang$suffix.js"></script>
SCRIPT
    Foswiki::Plugins::JQueryPlugin::createPlugin('jqp::moment', $session);

    require Foswiki::Contrib::PickADateContrib;
    Foswiki::Contrib::PickADateContrib::initDatePicker();

    Foswiki::Func::getContext()->{'NOWYSIWYG'} = 0;
    require Foswiki::Plugins::CKEditorPlugin;
    Foswiki::Plugins::CKEditorPlugin::_loadEditor('', $topic, $web);
    return "%JSI18N{folder=\"%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin/js/i18n\" id=\"TaskGrid\"}% <task-grid-bootstrap preferences-selector='$prefSelector'></task-grid-bootstrap>";
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
    my $updateurl = $params->{updateurl} || '';
    my $columns = 'created=Created Author,type=$Badge,assigned=AssignedTo,title=Title $AttachCount $ContextLink,due=DueDate,status=$Signal,checkbox=$Checkbox,'. ($params->{columns} || '');
    my $filters = $params->{filters} || '"Created" range="1" max="true", "Changed" range="1" max="true", Type';
    my $headers = 'created=Created:Created,type=Type,assigned=Assigned to,title=Title:Title,due=DueDate:Due date,status=Status,checkbox=,'. ($params->{headers} || '');
    my $captionTemplate = $params->{captiontemplate};
    my $filterTemplate = $params->{filtertemplate};
    my $states = $params->{states} || '%MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed,%MAKETEXT{"all"}%=all';
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
    my $desc = $params->{desc};
    $desc = 1 unless defined $desc;
    my $title = $params->{title} || '';
    my $createText = $params->{createlinktext};
    $createText = '%MAKETEXT{"Add item"}%' unless defined $createText;

    eval {
        $order =~s /^\s*//g;
        $order = from_json($order) if $order =~ /^\[/;
    };
    if ($@) {
        my $err = $@;
        $err =~ s/&/&amp;/;
        $err =~ s/</&lt;/;
        return "%RED%TASKSGRID: invalid query ($@)%ENDCOLOR%%BR%";
    }

    require Foswiki::Contrib::PickADateContrib;
    Foswiki::Contrib::PickADateContrib::initDatePicker();

    my @jqdeps = (
        "blockui", "select2", "tabpane", "tasksapi", "ui::dialog",
        "jqp::moment", "jqp::tooltipster", "jqp::underscore",
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

    # stop further processing if a dummy grid was requested...
    if ($template eq 'tasksapi::empty') {
        Foswiki::Func::loadTemplate('TasksAPIDefault');
        return $topicObject->expandMacros(Foswiki::Func::expandTemplate($template));
    }

    # if paging is disabled and no pagesize is given, return all tasks for the
    # current context.
    if ($paging eq 0 && !defined $params->{pagesize}) {
        $pageSize = -1;
    }


    if ($readonly) {
        $allowCreate = 0;
        $allowUpload = 0;
    }

    unless ($ctx eq 'any') {
        $templateFile = 'TasksAPIDefault' unless $templateFile;
        return "<strong>%RED%TASKSGRID: missing parameter form!%ENDCOLOR%<strong>"unless $form
    }

    my $_tplDefault = sub {
        $_[0] = $_[1] unless defined $_[0];
        $_[0] = 'tasksapi::empty' if $_[0] eq '';
    };
    $_tplDefault->($captionTemplate, 'tasksapi::grid::caption');
    $_tplDefault->($filterTemplate, 'tasksapi::grid::filter::defaults');

    $templateFile =~ s#/#.#g if $templateFile;
    Foswiki::Func::loadTemplate( $templateFile );

    my $req = $session->{request};
    my $trackerid = $req->param('tid') || '';
    my $isPrint = defined $req->param('cover') && $req->param('cover') eq 'print' ? 1 : 0;
    my $override = $trackerid eq $id || ($gridCounter - 1 eq 1 && $trackerid eq '');
    if ( $req->param('order') && $override ) {
        $order = $req->param('order');
    }

    if ( defined $req->param('desc') && $override ) {
        $desc = $req->param('desc') eq 0 ? 0 : $req->param('desc');
    }

    if ( !$isPrint && $req->param('pagesize') && $override ) {
        $pageSize = $req->param('pagesize');
    }

    my $page = 1;
    $page = $req->param('page') if $req->param('page') && $override;
    if ( !$isPrint && $pageSize && $page gt 1  && $override ) {
        $offset = (int($page) - 1) * int($pageSize);
    }

    # disable paging if we gonna export the current tracker as PDF.
    if ( $isPrint ) {
        $offset = 0;
        $page = 1;
        $pageSize = -1;
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
        columns => $columns,
        headers => $headers,
        filters => $filters,
        allowupload => $allowUpload,
        keepclosed => $keepclosed,
        sortable => $sortable,
        templatefile => $templateFile,
        tasktemplate => $taskTemplate,
        editortemplate => $editorTemplate,
        autoassign => $autoassign,
        autoassignTarget => $autoassignTarget,
        autouser => \@autouser,
        titlelength => int($titlelength),
        updateurl => $updateurl,
        _baseweb => $web,
        _basetopic => $topic
    );

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
    $query->{Status} = 'open' unless $query->{Status} || $override;
    $query->{Status} = $req->param('state') if $override && $req->param('state');

    if ($override) {
        my @list = map {$_ =~ s/^f_//; $_} grep(/^f_/, @{$req->{param_list}});
        foreach my $l (@list) {
            next if $l =~ /^_/; # Skip select2 preset inputs
            my $val = $req->param("f_$l");
            if ($l !~ /_(l|r)$/) {
                if ($l eq 'Status' && $val eq 'all') {
                    $query->{$l} = ['open', 'closed'];
                }elsif($val ne 'all'){
                    $query->{$l} = $val;
                }
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
    }

    if ($form) {
        my $f = Foswiki::Form->new($session, Foswiki::Func::normalizeWebTopicName(undef, $form) );
        my $topicType = $f->getField('TopicType');
        if ($topicType && !defined $query->{TopicType}) {
            $query->{TopicType} = $topicType->getDefaultValue;
        }
        while (my ($k, $v) = each %$query) {
            if ($v eq 'all') {
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

    $query->{Status} = ['open', 'closed'] unless $query->{Status};
    $settings{query} = to_json($query);
    my $res = _query(
        query => $query,
        order => $order,
        desc => $desc,
        count => $pageSize,
        offset => $offset
    );

    my $id_param = $req->param('id');
    if ($id_param && $override && !grep { $_->{id} eq $id_param } @{$res->{tasks}}) {
        my $extrares = _query(
            query => { id => $id_param },
        );
        unshift @{$res->{tasks}}, @{$extrares->{tasks}} if $extrares && $extrares->{tasks};
    }
    _deepen($res->{tasks}, $depth, $params->{order});

    my $select = join('\n', @options);
    $settings{totalsize} = $res->{total};
    my $json = to_json( \%settings );
    # Inside of quotes, angle brackets are valid json, however, when put into
    # a div element, they will be interpreted as html-tags and break the
    # settings. They often originate from "columns" params.
    $json =~ s#([<>])#sprintf('&\#x%02x;',ord($1))#ge;
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
        $task = _renderTask($topicObject, \%settings, $task, 1);
    }
    $tmplAttrs{tasks} = join('', @{$res->{tasks}});

    Foswiki::Func::loadTemplate('TasksAPIDefault');
    my $grid = $topicObject->expandMacros(Foswiki::Func::expandTemplate($template));
    $grid =~ s/\$grid_title/$title/ge;
    $grid =~ s/\$create_text/$createText/ge;

    delete $fctx->{task_allowcreate};
    delete $fctx->{task_showexpandercol};

    # todo.. templates und so
    if ( $pageSize ne -1 && $paging && defined $settings{totalsize} && defined $settings{pagesize} && $settings{totalsize} > $settings{pagesize}) {
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
PAGER
        $qstr =~ s#pagesize=[^&]+##;
        $pager .= <<PAGER;
  <ul class="pagination show-all">
    <li><a href="%SCRIPTURLPATH{"view"}%/$web/$topic?page=1&pagesize=-1$qstr" title="%MAKETEXT{"Show all"}%"><small>(%MAKETEXT{"Show all"}%)</small></a></li>
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

sub _getDisplayValue {
    my ($session, $form, $key, $value) = @_;
    my ($fweb, $ftopic) = split(/\./, $form);
    my $formObject = Foswiki::Form->new($session, $fweb, $ftopic);
    my $formField = $formObject->getField($key);
    return unless $formField;
    return unless $formField->can('getDisplayValue');
    return $formField->getDisplayValue($value);
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
    my $displayauthor = (defined $author ? _getDisplayName($author) : '');
    my $taskstopic = $task->{id};
    my $date = Foswiki::Func::formatTime($attachment->{date}->{epoch}, '$day $month $year');
    $taskstopic =~ s/\./\//;
    my $deleteBtn = $task->checkACL('change') ? '<td class="delete-attachment" title="%MAKETEXT{"Delete attachment"}%"><i class="fa fa-times"></i></td>' : '<td></td>';
    my $format = $params->{format} || '<tr><td>%MIMEICON{"$name" size="24" theme="oxygen"}%</td><td class="by"><span>$displayauthor</span><span>$date</span></td><td>$name<a href="$name" target="_blank" class="hidden"></a></td><td>$size</td>$deleteBtn</tr>';
    $format =~ s#\$name#$attachment->{name}#g;
    $format =~ s#\$size#$attachment->{size}->{human}#g;
    $format =~ s#\$author#$author#g;
    $format =~ s#\$displayauthor#$displayauthor#g;
    $format =~ s#\$date#$date#g;
    $format =~ s#\$deleteBtn#$deleteBtn#g;
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
            my $encComment = Foswiki::urlEncode(defined $cset->{comment} ? $cset->{comment} : '');
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

        if ($f->can('getDisplayValue')) {
            $changeOld = $f->getDisplayValue($changeOld);
            $changeNew = $f->getDisplayValue($changeNew);
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
    $out =~ s#\$date#makeDate($Foswiki::Plugins::SESSION, {_DEFAULT => Foswiki::Time::formatTime($cset->{at}, $params->{timeformat})})#eg;
    $out =~ s#\$fields#join($fsep, @fout)#eg;
    my $cmt = $cset->{comment} || '';
    if ($plain) {
        $cmt =~ s#<br\s*/?>#\n#g;
        $cmt =~ s#</p>#\n#g;
        $cmt =~ s#<.+?>##g;
    }
    $out =~ s#\$comment#$cmt#g;
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

sub _getTopicTitle {
    my $topic = shift;
    my ($w, $t) = Foswiki::Func::normalizeWebTopicName(undef, $topic);
    my ($meta) = Foswiki::Func::readTopic($w, $t);
    my $title = $meta->get('FIELD', 'TopicTitle');
    return  $title->{value} || $topic;
}

sub tagContextSelector {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

    my $task = $currentTask;
    if ($params->{task}) {
        $task = Foswiki::Plugins::TasksAPIPlugin::Task::load(Foswiki::Func::normalizeWebTopicName(undef, $params->{task}));
    }
    if (!$task) {
        return '%RED%TASKCONTEXTSELECTOR: not in a task template and no task parameter specified%ENDCOLOR%%BR%';
    }
    my $type = $task->getPref('TASK_TYPE') || '';
    if (!$type) {
        return '%RED%TASKCONTEXTSELECTOR: missing preference TASK_TYPE for given task%ENDCOLOR%%BR%';
    }

    my $title = _getTopicTitle($task->{fields}{Context});
    my @options = (<<OPTION);
<option class="foswikiOption" value="$task->{fields}{Context}" selected="selected">$title</option>
OPTION

    my %retval;
    my $ctx = db()->selectall_arrayref("SELECT DISTINCT t.Context, t.id FROM tasks t GROUP BY t.Context");
    foreach my $a (@$ctx) {
        my $t = Foswiki::Plugins::TasksAPIPlugin::Task::load(
            Foswiki::Func::normalizeWebTopicName(undef, $a->[1])
        );
        if ($t->getPref('TASK_TYPE') eq $type && $task->{fields}{Context} ne $t->{fields}{Context}) {
            unless($t->checkACL('change')){
                next;
            }
            $title = _getTopicTitle($a->[0]);
            my $option = "<option class=\"foswikiOption\" value=\"$a->[0]\">$title</option>";
            push(@options, $option);
        }
    }

    my $inner = join('', @options);
    return <<SELECT;
<select class="foswikiSelect" name="Context">$inner</select>
SELECT
}

sub makeDate {
    my( $session, $params, $topic, $web, $topicObject ) = @_;
    my $date = $params->{_DEFAULT};
    $date = Foswiki::Time::formatTime(time()) unless $date;

    if($date =~ /(\d{2}) (\w{3}) (\d{4})/) {
         $date = "$1 %MAKETEXT{\"$2\"}% $3"
    }
    return $date;
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

    my $type = $params->{type} || '';
    if ($type eq 'headers') {
        my $format = $params->{format} || '<th data-sort="$sortkey">$title</th>';
        my $header = $params->{header} || '';
        my $footer = $params->{footer} || '';

        my ($columns, $order) = _parseGridColumns($currentOptions->{columns}, $currentOptions->{headers});
        my @out;
        for my $h (@$order) {
            my $info = $columns->{$h};
            my $ttitle = $info->{title} ? $session->i18n->maketext($info->{title}) : '';
            my $out = $format;
            $out =~ s/\$sortkey/$info->{sortkey}/g;
            $out =~ s/\$title/$ttitle/g;
            $out =~ s/\$origtitle/$info->{title}/g;
            push @out, $out;
        }
        return join('', @out);
    }
    if ($type eq 'filters') {
        my @filters = split(/\s*,\s*/, $currentOptions->{filters});
        @filters = map { s/\$comma/,/gr } @filters;
        my @out;
        for my $f (@filters) {
            push @out, qq[\%TASKSFILTER{$f}\%];
        }
        return join('', @out);
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
        if (Foswiki::isTrue($params->{display})) {
            my $ffield = $task->{form}->getField($field);
            $val = $ffield->getDisplayValue($val) if $ffield && $ffield->can('getDisplayValue');
        }
        if ($type eq 'title') {
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
                unless(grep(/$v/, $currentOptions->{autouser} || 'Team')) {
                    my $tmp = $v;
                    $v = _getDisplayName($v) if $v;
                    $v = $tmp unless $v;
                }
            }

            $val = join('<br>', sort { lc($a) cmp lc($b) } @vals);
        }
        if (Foswiki::isTrue($params->{escape}, 0)) {
            $val =~ s/&/&amp;/g;
            $val =~ s/</&lt;/g;
            $val =~ s/>/&gt;/g;
            $val =~ s/"/&quot;/g;
        }
        if (Foswiki::isTrue($params->{nohtml}, 0)) {
            $val =~ s|<.+?>||g;
            $val = HTML::Entities::decode_entities($val);
        }
        return $val;
    }
    if ($type eq 'changeset') {
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
    if ($type eq 'attachments') {
        my @out;
        foreach my $attachment (sort { $a->{name} cmp $b->{name} } $task->{meta}->find('FILEATTACHMENT')) {
            my $out = _renderAttachment($topicObject, $task, $attachment, $params);
            push @out, $out if $out ne '';
        }
        my $header = $params->{header} || '<table class="task-attachments"><thead><tr><th>&nbsp;</th><th class="created">%MAKETEXT{"Created"}%</th><th class="name">%MAKETEXT{"Name"}%</th><th class="size">%MAKETEXT{"Size"}%</th><th></th></tr></thead></tbody>';
        my $footer = $params->{footer} || '</tbody></table>';
        return $header . join($params->{separator} || "\n", @out) . $footer;
    }
    if ($type eq 'changesets') {
        my @out;
        foreach my $cset (sort { $b->{name} <=> $a->{name} } $task->{meta}->find('TASKCHANGESET')) {
            my $out = _renderChangeset($topicObject, $task, $cset, $params);
            push @out, $out if $out ne '';
        }
        return join($params->{separator} || "\n", @out);
    }
    if ($type eq 'children') {
        my @out;
        for my $child (@{$task->cached_children || []}) {
            next if $child->{fields}{Status} eq 'deleted';
            push @out, _renderTask($topicObject, $currentOptions, $child);
        }
        return join($params->{separator} || '', @out);
    }
    if ($type eq 'columns') {
        my $format = $params->{format} || '<td class="$id">$fields</td>';

        my ($columns, $order) = _parseGridColumns($currentOptions->{columns}, $currentOptions->{headers});
        my @out;
        for my $c (@$order) {
            my @fields;
            my $info = $columns->{$c};
            my $out = $format;
            for my $f (@{$info->{fields}}) {
                if ($f !~ /^\$/) {
                    # TODO suitable alternative to hardcoding <span>
                    push @fields, qq[<span>%TASKINFO{field="$f" display="on"}%</span>];
                } elsif (lc($f) eq '$checkbox') {
                    $out = q[%TMPL:P{"tasksapi::task::field::checkbox"}%];
                } else {
                    my $field_p = ($f =~ s/^\$//r);
                    push @fields, qq[\%TMPL:P{"tasksapi::task::field::\L$field_p"}\%];
                }
            }
            $out =~ s/\$id/$info->{id}/g;
            $out =~ s/\$fields/join('', @fields)/eg;
            push @out, $out;
        }
        return $task->{meta}->expandMacros(join('', @out));
    }
    if ($params->{taskcfg}) {
        return $task->getPref(uc($params->{taskcfg})) || '';
    }

    if (my $meta = $params->{meta}) {
        return $task->form->web .'.'. $task->form->topic if $meta eq 'form';
        return $task->id if $meta eq 'id';
        if ($meta eq 'json') {
            local $storedTemplates;
            my $json = to_json(_enrich_data($task, {tasktemplate => 'tasksapi::empty'}));
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
        my %opts = %$currentOptions;
        $opts{tasktemplate} = $tpl;
        return _renderTask($topicObject, \%opts, $task);
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

    $web |= '';
    $topic |= '';

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

sub maintenanceHandler {
    my $sys = $Foswiki::cfg{SystemWebName} || 'System';

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:checkoldform", {
        name => "TasksAPI: TasksAPIDefaultTaskForm",
        description => "Check for existence of outdated TasksAPIDefaultTaskForm",
        check => sub {
            my $result = { result => 0 };
            if (Foswiki::Func::topicExists($sys, "TasksAPIDefaultTaskForm")) {
                $result->{result} = 1;
                $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::WARN;
                $result->{solution} = "Make sure every installed app is using its own form. Afterwards delete $sys.TasksAPIDefaultTaskForm";
            }

            return $result;
       }
    });

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:checkoldtemplate", {
        name => "TasksAPI: TasksAPITemplate",
        description => "Check for existence of outdated TasksAPITemplate",
        check => sub {
            my $result = { result => 0 };
            if (Foswiki::Func::topicExists($sys, "TasksAPITemplate")) {
                $result->{result} = 1;
                $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::WARN;
                $result->{solution} = "Make sure every installed app is using its task templates. Afterwards delete $sys.TasksAPITemplate";
            }

            return $result;
       }
    });

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:debug", {
        name => "TasksAPI: Debug Mode",
        description => "Check whether TasksAPI is running in debug mode",
        check => sub {
            my $result = { result => 0 };
            if ($Foswiki::cfg{TasksAPIPlugin}{Debug}) {
                $result->{result} = 1;
                $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::WARN;
                $result->{solution} = "Set Foswiki::cfg{TasksAPIPlugin}{Debug} to 0.";
            }

            return $result;
       }
    });

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:legacysolr", {
        name => "TasksAPI: Legacy Solr Integration",
        description => "Check whether TasksAPI is running in legacy Solr mode (support for Solr <5)",
        check => sub {
            my $result = { result => 0 };
            if ($Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration}) {
                $result->{result} = 1;
                $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::WARN;
                $result->{solution} = "Set Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration} to 0 if you're running a Solr release >= 5.";
            }

            return $result;
       }
    });

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:tasksweb", {
        name => "TasksAPI: Existence of tasks web",
        description => "Check for valid Foswiki::cfg{TasksAPIPlugin}{DBWeb} configuration",
        check => sub {
            my $result = { result => 0 };
            my $web = $Foswiki::cfg{TasksAPIPlugin}{DBWeb};
            return $result if $web && Foswiki::Func::webExists($web);

            $result->{result} = 1;
            $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::CRITICAL;
            $result->{solution} = "Foswiki::cfg{TasksAPIPlugin}{DBWeb} is either unset or specified web doesn't exist! You have to manually create this web.";
            return $result;
       }
    });

    Foswiki::Plugins::MaintenancePlugin::registerCheck("tasksapi:jquery", {
        name => "TasksAPI: jQuery Plugin",
        description => "Check whether TasksAPI's jQuery plugin is enabled",
        check => sub {
            my $result = { result => 0 };
            unless ($Foswiki::cfg{JQueryPlugin}{Plugins}{TasksAPI}{Enabled}) {
                $result->{result} = 1;
                $result->{priority} = $Foswiki::Plugins::MaintenancePlugin::CRITICAL;
                $result->{solution} = "Set Foswiki::cfg{JQueryPlugin}{Plugins}{TasksAPI}{Enabled} to 1.";
            }

            return $result;
       }
    });
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
