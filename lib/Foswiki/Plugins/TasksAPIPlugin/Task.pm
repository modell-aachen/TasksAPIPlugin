# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin::Task;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Form ();
use Foswiki::Plugins::KVPPlugin;
use Foswiki::Plugins::WysiwygPlugin::Handlers;

use Date::Manip;
use Digest::SHA;
use Error qw( :try );
use JSON;

# Create a completely arbitrary task object, with no validation or anything
sub new {
    my $class = shift;
    my %params = @_;
    my $self = bless {}, $class;
    @{$self}{'id', 'form', 'text', 'meta'} = delete @params{'id','form','text','meta'};
    $self->{fields} = \%params;
    $self;
}

# Load task from a given Foswiki::Meta object or web/topic name
sub load {
    my ($web, $topic) = @_;
    my $meta;
    if (ref $web) {
        $meta = $web;
        $web = $meta->web;
        $topic = $meta->topic;
    } else {
        ($web, $topic) = Foswiki::Func::normalizeWebTopicName($web, $topic);
        my $_text;
        ($meta, $_text) = Foswiki::Func::readTopic($web, $topic);
    }
    die "Could not read task topic '$web.$topic'" unless ref $meta;

    my $form = $meta->getFormName;
    die "Alleged task topic '$web.$topic' has no form attached to it" unless $form;
    my $fields;
    ($form, $fields) = _loadForm($web, $form);

    my %data;
    foreach my $f (@$fields) {
        my $name = $f->{name};
        my $entry = $meta->get('FIELD', $name);
        my $defValue = $f->getDefaultValue if $f->can('getDefaultValue');
        $defValue = '' unless defined $defValue;
        my $val = $entry ? $entry->{value} : undef;
        $val = $defValue unless defined $val && $val ne '';
        if($name eq 'LocalTask') {
            my $ctx = $data{Context} || ($meta->get('FIELD', 'Context') || {})->{value};
            $val = _mapLocalTaskToKVP($val, $ctx);
        }
        $data{$name} = $val;
    }
    if (!$data{TopicType} || $data{TopicType} !~ /^task\b/) {
        die "Alleged task topic '$web.$topic' is not actually a task\n";
    }
    $web =~ s#/#.#g;
    $data{id} = "$web.$topic";
    $data{form} = $form;
    $data{text} = $meta->text;
    $data{meta} = $meta;
    my $task = __PACKAGE__->new(%data);
    $task->{_canChange} = $task->checkACL('change');
    $task;
}

sub getEditLock {
    my ($web, $topic) = @_;

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName($web, $topic);

    my (undef, $loginName, $unlockTime) = Foswiki::Func::checkTopicEditLock($web, $topic);
    return ($loginName, $unlockTime);
}

sub _mapLocalTaskToKVP {
    my ($unmapped, $ctx) = @_;

    my @pairs = split(/\s*,\s*/, $unmapped);
    push @pairs, '' unless scalar @pairs;

    my $value = '';
    foreach my $pair (@pairs) {
        if($pair =~ m#^State (.*?)=(.*)#) {
            my $state = $1;
            my $stateVal = $2;
            my ($ctxWeb, $ctxTopic) = Foswiki::Func::normalizeWebTopicName(undef, $ctx);
            my $ctxState = Foswiki::Plugins::KVPPlugin::WORKFLOWSTATE($Foswiki::Plugins::SESSION, {}, $ctxTopic, $ctxWeb);
            if($state eq $ctxState) {
                $value = $stateVal;
                last;
            }
        } else {
            $value = $pair;
            last;
        }
    }
    return $value;
}

sub data {
    my $this = shift;
    {
        id => $this->{id},
        form => $this->{form},
        text => $this->{text},
        fields => $this->{fields},
    };
}

# Load all tasks from the Tasks web that match all filter functions passed as
# arguments
#
# This bypasses access controls (unless you pass it a filter to check access).
sub loadMany {
    my @res;
    my $web = $Foswiki::cfg{TasksAPIPlugin}{DBWeb};
    my $wmeta = Foswiki::Meta->new($Foswiki::Plugins::SESSION, $web);
    my $iter = $wmeta->eachTopic;
    Iter: while ($iter->hasNext) {
        my ($m) = Foswiki::Func::readTopic($web, $iter->next);
        my $f = $m->get('FIELD', 'TopicType');
        next if !$f || !ref $f;
        my $t = load($m);
        for my $filter (@_) {
            next Iter if !$filter->($t);
        }
        push @res, $t;
    }
    @res;
}

# Load tasks that match a query, optionally filtering by ACL.
# Takes an options hash with these fields:
# - query:  hashref. Key is the lowercase name of the field to match.
#                    Value is the desired value, or undef to match any value in a multi-valued field.
# - offset: how many results to skip; defaults to none.
# - count:  how many results to return after skipping; defaults to all.
# - order:  field by which to order (does not work for multi-valued fields). Defaults to non-deterministic ordering.
# - desc:   reverse the ordering; defaults to false.
# - acl:    apply view ACL restrictions; defaults to true.
sub search {
    &Foswiki::Plugins::TasksAPIPlugin::_query;
}

# Initialize a task object from the raw task text (embedded store form)
sub _loadRaw {
    my ($web, $topic, $raw) = @_;
    my $meta = Foswiki::Meta->new($Foswiki::Plugins::SESSION, $web, $topic, $raw);
    load($meta);
}

# Loads a DataForm used by a task object
sub _loadForm {
    my ($web, $topic) = @_;

    my ($formWeb, $formTopic) = Foswiki::Func::normalizeWebTopicName($web, $topic);
    my $form = Foswiki::Form->new($Foswiki::Plugins::SESSION, $formWeb, $formTopic);
    die "Can't read form definition '$formWeb.$formTopic' for task topic '$web.$topic'" unless ref $form;

    my $fields = $form->getFields;
    ($form, $fields);
}

# Grab all objects that share the same context (and parent, if any)
sub _getSiblings {
    my $context = shift;
    return () unless defined $context;
    my @filters;
    push @filters, sub {
        return shift->{fields}{Context} eq $context;
    };
    my $parent = shift;
    if (defined $parent) {
        push @filters, sub {
            return shift->{fields}{Parent} eq $parent;
        };
    }
    loadMany(@filters);
}

# Classic array reduce operation
sub _reduce {
    my $list = shift;
    my $cb = shift;
    return unless @$list;
    my $cur = pop @$list;
    while (@$list) {
        my $candidate = pop @$list;
        $cur = $cb->($cur, $candidate);
    }
    $cur;
}

sub getACL {
    my ($this, $type) = @_;

    return _getACL($this->{meta}, $this->{form}, $type);
}

sub _getACL {
    my ($this, $form, $type) = @_;

    # XXX It is entirely possible to get collect multiple wikiACLs, however
    # only the first will be evaluated in _checkACL and also the db will only
    # hold a single value.

    $type = "\U$type";
    my $aclPref = $form->getPreference("TASKACL_\U$type") || '';
    my $ctx = $this->get('FIELD', 'Context') || {};
    my $ignoreContextACL = Foswiki::isTrue($form->getPreference('TASKCFG_IGNORE_CONTEXT_ACL'), 0);
    my $ignoreWikiACL = Foswiki::isTrue($form->getPreference('TASKCFG_IGNORE_WIKI_ACL'), 0);

    return () if $aclPref =~ /^\s*$/ && $ignoreContextACL;
    return ("\$wikiACL($ctx->{value} $type)") if $aclPref =~ /^\s*$/;

    while ( $aclPref =~ /\$curvalue\(([^)]+)\)/g ) {
        my $f = $this->get('FIELD', $1);
        if ( $f && $f->{value}) {
            $aclPref =~ s/\$curvalue\($1\)/$f->{value}/eg;
        } else {
            $aclPref =~ s/\$curvalue\($1\)//g;
        }
    }

    $aclPref .= ",\$contextACL";
    $aclPref = $this->expandMacros($aclPref);
    my @acl;
    my $aclFromRef = sub {
        my $ref = $this->get('FIELD', shift);
        return () unless $ref;
        my $refedTopic = load(undef, $ref->{value});
        return () unless $refedTopic;
        return _getACL($refedTopic->{meta}, $refedTopic->{form}, $type);
    };

    $aclPref =~ s/\$parentACL\b/push @acl, $aclFromRef->('Parent'); ''/e;
    $aclPref =~ s/\$wikiACL\($ctx->{value} $type\)/\$contextACL/g;
    $aclPref =~ s/\$wikiACL\([^\)]*\)//g if $ignoreWikiACL;
    $aclPref =~ s/\$contextACL\b//g if $ignoreContextACL;
    $aclPref =~ s/\$contextACL\b/\$wikiACL($ctx->{value} $type)/g;
    $aclPref =~ s/Team\b//g;
    push @acl, grep { $_ } split(/\s*,\s*/, $aclPref);
    my %acl; @acl{@acl} = @acl;
    keys %acl;
}

sub _checkACL {
    my $session = $Foswiki::Plugins::SESSION;
    my $acl = shift;
    return 1 if !@$acl || Foswiki::Func::isAnAdmin();
    my $user = shift || $session->{user};
    my $aclstring = join(',', @$acl);
    my $cache = Foswiki::Plugins::TasksAPIPlugin::_cachedACL($aclstring);
    return $cache if defined $cache;

    my $_checkItem = sub {
        my $item = shift;
        if ($user ne 'BaseUserMapping_666' && $item eq '*') {
            Foswiki::Plugins::TasksAPIPlugin::_cacheACL($aclstring, 1);
            return 1;
        }
        if ($item =~ /\$wikiACL\((\S+)\s+([^)]+)\)/) {
            my ($aclwt, $type) = ($1, $2);
            $type = uc $type;
            my $ccache = Foswiki::Plugins::TasksAPIPlugin::_cachedContextACL("$aclwt,$type");
            return $ccache if defined $ccache;

            my ($meta) = Foswiki::Func::readTopic(undef, $aclwt);
            $ccache = $meta->haveAccess("$type", $user);

            if ($type eq 'CHANGE') {
                my ($aclw, $aclt) = Foswiki::Func::normalizeWebTopicName(undef, $aclwt);
                $ccache = Foswiki::Plugins::KVPPlugin::_WORKFLOWALLOWS(
                    $session,
                    {uncontrolled => $ccache},
                    $aclt,
                    $aclw
                );
            }

            Foswiki::Plugins::TasksAPIPlugin::_cacheContextACL("$aclwt,$type", $ccache);
            return $ccache;
        }
        my $cuid = Foswiki::Func::getCanonicalUserID($item) || '';
        if ($user eq $cuid || Foswiki::Func::isGroup($item) && Foswiki::Func::isGroupMember($item, $user)) {
            Foswiki::Plugins::TasksAPIPlugin::_cacheACL($aclstring, 1);
            return 1;
        }
    };

    foreach my $item (@$acl) {
        return 1 if $_checkItem->($item);
    }

    Foswiki::Plugins::TasksAPIPlugin::_cacheACL($aclstring, 0);
    0;
}

sub checkACL {
    my ($this, $type) = @_;
    my @acl = _getACL($this->{meta}, $this->{form}, $type);
    _checkACL(\@acl);
}

sub getPref {
    my ($task, $name, $subkey) = @_;

    my $prefmeta = $task->{form};
    my $pref;
    while (1) {
        $pref = $prefmeta->getPreference('TASKCFG_'. $name);
        last if defined $pref;
        my $inclpref = $prefmeta->getPreference('TASKCFG_INCLUDE_CONFIG');
        return unless defined $pref;
        ($prefmeta) = Foswiki::Func::readTopic(Foswiki::Func::normalizeWebTopicName($prefmeta->web, $inclpref));
    }
    return unless defined $pref;

    $pref =~ s/\$taskpref\(([^)]+)(?::([^)])+)?\)/$task->getPref($1, $2)/eg;
    $pref =~ s!\$curvalue\(([^)]+)\)!defined $task->{fields}{$1} ? $task->{fields}{$1} : ''!eg;
    $pref =~ s/\$formweb/$prefmeta->web/eg;

    if (!defined $subkey) {
        $pref =~ s/^\s*|\s*$//gs;
        return $task->{meta}->expandMacros($pref);
    }

    # Parse out sub-keys/values
    my %pref;
    my @pref = split(/\|/, $pref);
    for my $p (@pref) {
        $p =~ s#^\s*|\s*$##gs;
        next if $p eq '';
        my ($k, $v) = split(/=/, $p, 2);
        $v = 1 unless defined $v;
        $pref{$k} = $v;
    }
    my @keys = ($subkey eq '*') ? $subkey : keys %pref;
    for my $key (@keys) {
        $pref{$key} = $task->{meta}->expandMacros($pref{$key});
    }
    return $pref{$subkey} if $subkey ne '*';
    return \%pref;
}

sub getBoolPref {
    my ($task, $name, $subkey) = @_;
    my $res = $task->getPref($name, $subkey);
    return 0 if !defined $res || $res =~ /^\s*(?:no|false|0|)\s*$/i;
    1;
}

sub create {
    my %data = @_;
    my $form = delete $data{form};
    my $fields;
    my $dontSave = delete $data{dontsave};

    my $web = $Foswiki::cfg{TasksAPIPlugin}{DBWeb};
    my ($formWeb, $formTopic) = Foswiki::Func::normalizeWebTopicName($web, $form);
    ($form, $fields) = _loadForm($formWeb, $formTopic);
    my $formName;
    if ($formWeb eq $web) {
        $formName = "$formTopic";
    } else {
        $formName = "$formWeb.$formTopic";
    }

    my $topic = "Task-";
    my $hash = Digest::SHA::sha1_hex(encode_json(\%data));
    while (Foswiki::Func::topicExists(undef, "$web.$topic$hash")) {
        $hash = Digest::SHA::sha1_hex($hash . rand(99999)); # yay
        # ... still a race condition, though
    }
    $topic .= $hash;

    my $meta = Foswiki::Meta->new($Foswiki::Plugins::SESSION, $web, $topic);
    $meta->text(delete $data{text});
    $meta->putKeyed('FORM', {
        name => $formName,
    });
    $data{TopicType} = $form->getField('TopicType')->getDefaultValue || 'task';
    foreach my $f (@$fields) {
        my $name = $f->{name};
        my $default = $f->{value};
        $default = $f->getDefaultValue if $f->can('getDefaultValue');
        $meta->putKeyed('FIELD', {
            name => $name, title => $f->{tooltip}, value => defined($data{$name}) ? $data{$name} : $default
        });
    }

    if ( $meta->get('FIELD', 'Status')->{value} eq 'closed' ) {
        my $clsd = $meta->get('FIELD', 'Closed');
        unless (defined $clsd && $clsd->{value}) {
            $meta->putKeyed('FIELD', { name => 'Closed', title => '', value => time });
        }
    }

    $meta->saveAs($web, $topic, dontlog => 1, minor => 1) unless $dontSave;
    my $task = load($meta);

    if (my $statusmap = $task->getPref("MAP_STATUS_FIELD")) {
        my $vals = $task->getPref("MAP_STATUS", "*");
        if ($data{$statusmap}) {
            my $val = $data{$statusmap};
            $data{Status} = $vals->{$val} || $val;
        } elsif ($data{Status}) {
            $data{$statusmap} = $data{Status};
        }

        if ( $data{Status} eq 'closed' ) {
            my $clsd = $meta->get('FIELD', 'Closed');
            unless (defined $clsd && $clsd->{value}) {
                $meta->putKeyed('FIELD', { name => 'Closed', title => '', value => time });
            }
        }

        my $mstatus = $meta->get('FIELD', $statusmap);
        $meta->putKeyed('FIELD', {name => 'Status', title => '', value => $data{Status}});
        $meta->putKeyed('FIELD', {name => $statusmap, title => '', value => $mstatus->{value}});
        $meta->saveAs($web, $topic, dontlog => 1, minor => 1) unless $dontSave;
        $task = load($meta);
    }

    $task->notify('created');
    $task->_postCreate();
    $task->_postUpdate();
    Foswiki::Plugins::TasksAPIPlugin::_index($task) unless $dontSave;

    Foswiki::Plugins::SolrPlugin::afterSaveHandler($meta->text(), $topic, $web, my $error, $meta);

    $task->{_canChange} = $task->checkACL('change');
    $task;
}

sub copy {
    my $self = shift;
    my %opts = @_;
    my ($formweb, $formtopic) = $self->{meta}->getFormName =~ /
        # branch reset
        (?|
          # $web   $topic
          ^ (.*?)\.(.*)$ |
          # '' $topic
          ^ () (.*)$
        )
    /x;

    my %data = (
        %{$self->{fields}},
        form => join('.', Foswiki::Func::normalizeWebTopicName($formweb, $opts{form} || $formtopic)),
        TopicType => $opts{type} || $self->{fields}{TopicType},
        Context => $opts{context},
        defined $opts{fields} ? %{$opts{fields}} : ()
    );
    my $dest = create(%data);

    # Copy attachments
    my @att = $self->{meta}->find('FILEATTACHMENT');
    return $dest unless @att;
    for my $att (@att) {
        next unless $self->{meta}->hasAttachment($att->{name});
        $self->{meta}->copyAttachment($att->{name}, $dest->{meta});
    }
    # Index again to pick up the attachment metadata
    Foswiki::Plugins::TasksAPIPlugin::_index($dest);
    Foswiki::Plugins::SolrPlugin::afterSaveHandler($self->{meta}->text(), $self->{meta}->{topic}, $self->{meta}->web(), my $error, $self->{meta});
    return $dest;
}

sub notify {
    my ($self, $type, %options) = @_;

    my $disabled = $Foswiki::cfg{TasksAPIPlugin}{DisableNotifications}
        || Foswiki::Func::getPreferencesValue('tasksapi_suppress_logging')
        || 0;
    return if $disabled;

    my $notify = Foswiki::Plugins::TasksAPIPlugin::withCurrentTask($self, sub { $self->getPref("NOTIFY_\U$type") });
    return unless $notify;
    my $tpl = $self->getPref("NOTIFY_\U${type}_TEMPLATE") || "TasksAPI\u${type}Mail";

    require Foswiki::Contrib::MailTemplatesContrib;
    Foswiki::Func::pushTopicContext(Foswiki::Func::normalizeWebTopicName(undef, $self->{fields}{Context}));
    Foswiki::Func::setPreferencesValue('TASKSAPI_MAIL_TO', $notify);

    my $actor = Foswiki::Func::getWikiName();
    if ($Foswiki::Plugins::SESSION->{users}->{mapping}->can('getDisplayName')) {
        my $cuid = Foswiki::Func::getCanonicalUserID($actor);
        unless ($cuid =~ /^BaseUserMapping/) {
            my $displayName = $Foswiki::Plugins::SESSION->{users}->{mapping}->getDisplayName($cuid);
            $actor = $displayName unless $displayName eq ($Foswiki::cfg{Ldap}{DisplayNameFormat} || '');
        }
    }
    Foswiki::Func::setPreferencesValue('TASKSAPI_ACTOR', $actor);
    my $mailPreferences = {};
    my $mailLanguage = Foswiki::Func::getPreferencesValue('MAIL_LANGUAGE');
    if($mailLanguage){
        $mailPreferences->{LANGUAGE} = $mailLanguage;
    }
    Foswiki::Plugins::TasksAPIPlugin::withCurrentTask($self, sub { Foswiki::Contrib::MailTemplatesContrib::sendMail($tpl, {GenerateInAdvance => 1, IncludeCurrentUser => 0}, $mailPreferences, 1) });
    Foswiki::Func::popTopicContext();
}

sub update {
    my ($self, %data) = @_;
    my ($web, $topic) = ($self->{id} =~ /^(.*)\.(.*)$/);
    $web =~ s#\.#/#g;

    my $meta = $self->{meta};
    ($meta) = Foswiki::Func::readTopic($web, $topic) unless ref $meta;

    my ($formWeb, $formTopic) = ($self->{form}->web, $self->{form}->topic);
    my $formName;
    if ($formWeb eq $web) {
        $formName = "$formTopic";
    } else {
        $formName = "$formWeb.$formTopic";
    }
    $meta->putKeyed('FORM', {
        name => $formName,
    });

    $self->_preUpdate;

    my %skip_changeset;
    if (my $statusmap = $self->getPref("MAP_STATUS_FIELD")) {
        my $vals = $self->getPref("MAP_STATUS", "*");
        $skip_changeset{Status} = 1;
        if ($data{$statusmap}) {
            my $val = $data{$statusmap};
            $data{Status} = $vals->{$val} || $val;
        } elsif ($data{Status}) {
            $data{$statusmap} = $data{Status};
        }
    }

    my @changes;
    delete $data{TopicType};
    my @comment = delete $data{comment};
    @comment = () if @comment && (!defined $comment[0] || $comment[0] =~ /^\s*$/s);
    my $defChange;
    my $notify = 'changed';
    foreach my $f (@{ $self->{form}->getFields }) {
        my $name = $f->{name};
        my $old = $self->{fields}{$name};
        if (!exists $data{$name} && (!defined $old || $old eq '')) {
            my $defValue = $f->getDefaultValue() if $f->can('getDefaultValue');
            $defValue = '' unless defined $defValue;
            $meta->putKeyed('FIELD', { name => $name, title => $f->{description}, value => $defValue });
            if($name eq 'LocalTask') {
                my $ctx = $data{Context} || ($meta->get('FIELD', 'Context') || {})->{value};
                $defValue = _mapLocalTaskToKVP($defValue, $ctx);
            }
            $self->{fields}{$name} = $defValue;
            $defChange = 1 if $defValue ne '';
            next;
        } elsif (!exists $data{$name}) {
            next;
        }
        my $val = $data{$name};

        if ($val eq '' && $old ne '') {
            $meta->remove('FIELD', $name);
            delete $self->{fields}{$name};
            push @changes, { type => 'delete', name => $name, old => $old } unless $skip_changeset{$name};
            next;
        }
        if ($old eq '' && $val ne '') {
            push @changes, { type => 'add', name => $name, new => $val } unless $skip_changeset{$name};
        } elsif ($val ne $old) {
            if ($name eq 'Context') {
                push @changes, { type => 'change', name => $name, old => _ctxToTitle($old), new => _ctxToTitle($val) } unless $skip_changeset{$name};
            } else {
                push @changes, { type => 'change', name => $name, old => $old, new => $val } unless $skip_changeset{$name};
            }
        }

        if ($name eq 'AssignedTo' && $old ne $val) {
            $notify = 'reassigned';
        }
        if ($name eq 'Status') {
            if ($old eq 'closed' && $val eq 'open') {
                $notify = 'reopened';
            } elsif ($old eq 'open' && $val eq 'closed') {
                $notify = 'closed';
            }
        }

        $meta->putKeyed('FIELD', { name => $name, title => $f->{description}, value => $val });
        $self->{fields}{$name} = $val;
    }
    if (@comment) {
        unshift @comment, 'comment';
    }
    if ($self->{fields}{Status} eq 'open') {
        $meta->remove('FIELD', 'Closed');
        delete $self->{fields}{Closed};
    } else {
        $self->{fields}{Closed} = time;
        $meta->putKeyed('FIELD', { name => 'Closed', title => '', value => $self->{fields}{Closed} });
    }

    my $changed = $data{cid} || @changes || @comment || $defChange;

    unless (Foswiki::Func::getPreferencesValue('tasksapi_suppress_logging')) {
        # just update the comment if a changeset id is given
        if ( $data{cid} ) {
            my $cid = delete $data{cid};
            my $set = $meta->get('TASKCHANGESET', $cid);
            my $cmt = pop(@comment);
            $set->{comment} = $cmt;
            if ( $set->{changes} eq '[]' && $cmt =~ /^\s*$/ ) {
                $meta->remove('TASKCHANGESET', $cid);
            } else {
                $meta->putKeyed('TASKCHANGESET', $set);
            }

            $changed = 1;
        } elsif (@changes || @comment) {
            # Find existing changesets to determine new ID
            my @changesets = $meta->find('TASKCHANGESET');
            my @ids;
            if (scalar(@changesets)) {
                @ids = sort {$a <=> $b} (map {int($_->{name})} @changesets);
            }

            my $newid = 1 + (@ids && scalar(@ids) ? pop(@ids) : 0);
            $meta->putKeyed('TASKCHANGESET', {
                name => $newid,
                actor => $Foswiki::Plugins::SESSION->{user},
                at => scalar(time),
                changes => to_json(\@changes),
                @comment
            });
            $self->{changeset} = $newid;
            $changed = 1;
        }

        if ($changed) {
            $self->{fields}{Changed} = time;
            $meta->putKeyed('FIELD', { name => 'Changed', title => '', value => $self->{fields}{Changed} });
        }
    }

    return unless $changed || $data{_force_update};

    $meta->saveAs($web, $topic, dontlog => 1, minor => 1);
    $self->notify($notify);
    delete $self->{changeset};
    if ($notify eq 'closed') {
        $self->_postClose;
    } elsif ($notify eq 'reopened') {
        $self->_postReopen;
    } elsif ($notify eq 'reassigned') {
        $self->_postReassign;
    }

    $self->_postUpdate;
    Foswiki::Plugins::TasksAPIPlugin::_index($self, 0, $data{aclCache});

    Foswiki::Plugins::SolrPlugin::afterSaveHandler($meta->text(), $topic, $web, my $error, $meta);
}

sub close {
    my $self = shift;
    $self->update(Status => 'closed');
}

sub id { shift->{id}; }
sub form { shift->{form}; }
sub text { shift->{text}; }
sub attr { my ($self, $attr) = @_; $self->{fields}{$attr}; }

sub parent {
    my $self = shift;
    load(undef, $self->{fields}{Parent});
}

sub children {
    my ($self, $acl) = @_;
    $acl = 1 unless defined $acl;
    my $res = $self->cached_children($acl);
    return @$res if defined $res;

    search(query => {Parent => $self->{id}}, acl => $acl);
}

sub cached_children {
    my $self = shift;
    my $acl = shift;
    $acl = 1 unless defined $acl;
    return $self->{children_acl} if $acl;
    return $self->{children};
}

sub _ctxToTitle {
    my $webtopic = shift;
    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $webtopic);
    my ($meta) = Foswiki::Func::readTopic($web, $topic);
    my $title = $meta->get('FIELD', 'TopicTitle');
    return $title->{value} if defined $title && $title->{value};
    return $webtopic;
}

sub _postCreate {
    # TODO
}
sub _postClose {
    my $self = shift;
    Foswiki::Plugins::TasksAPIPlugin::Job::remove(
        task => $self,
        type => 'remind',
    );
    if (my $reopen = $self->getPref('SCHEDULE_REOPEN')) {
        my $date = new Date::Manip::Date();
        unless ($date->parse($reopen)) {
            Foswiki::Plugins::TasksAPIPlugin::Job::create(
                type => 'reopen',
                time => $date,
                task => $self,
            );
        }
    }
}
sub _postReopen {
    my $self = shift;
    Foswiki::Plugins::TasksAPIPlugin::Job::remove(
        task => $self,
        type => 'reopen',
    );
}
sub _postReassign {
    # TODO
}

sub _preUpdate {
    my $self = shift;
    my $remind = $self->getPref('SCHEDULE_REMIND');
    $self->{_remindPrev} = $remind || '';
}

sub _postUpdate {
    my $self = shift;
    my $remind = $self->getPref('SCHEDULE_REMIND');
    $self->{_remindPrev} = '' unless defined $self->{_remindPrev};
    if (defined $remind && $remind ne $self->{_remindPrev}) {
        delete $self->{_remindPrev};
        Foswiki::Plugins::TasksAPIPlugin::Job::remove(
            type => 'remind',
            task => $self,
        );
        if ($remind ne '') {
            my $date = new Date::Manip::Date();
            unless ($date->parse($remind)) {
                Foswiki::Plugins::TasksAPIPlugin::Job::create(
                    type => 'remind',
                    time => $date,
                    task => $self,
                );
            }
        }
    }
}

sub solrize {
    my $self = shift;
    my $indexer = shift;
    my $legacy = shift;
    return unless $self->{fields}{Status};
    return if $self->{fields}{Status} eq 'deleted';

    my $language = Foswiki::Func::getPreferencesValue('CONTENT_LANGUAGE') || "en";
    my $ctx = $self->{fields}{Context};
    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $ctx);
    my $webtopic = "$web.$topic";

    my $date = '1970-01-01T00:00:00Z';
    my $created = _formatSolrDate($self->{fields}{Created});
    if ( $self->{fields}{DueDate} || $self->{fields}{Due} ) {
        $date = _formatSolrDate($self->{fields}{DueDate} || $self->{fields}{Due});
    }

    my $ctxurl = Foswiki::Func::getViewUrl(
        Foswiki::Func::normalizeWebTopicName(undef, $self->{fields}{Context})
    );

    my $text = $self->{fields}{Description};
    $text = Foswiki::Plugins::WysiwygPlugin::Handlers::TranslateHTML2TML($text, $topic, $web);
    $text = $indexer->plainify($text);

    my $mappedState = $self->getPref('MAP_STATUS_FIELD') || 'Status';
    my $state = $self->{fields}{$mappedState} || 'open';
    my $taskurl = "$ctxurl?id=" . $self->{id} . "&state=$state&tab=tasks_$state";
    my $type = $self->getPref('TASK_TYPE') || $self->{fields}{Type} || 'task';
    my $icon = $self->getPref('SOLRHIT_ICON') || '';
    $icon = $self->{meta}->expandMacros($icon) if $icon =~ /%[^%]+%/;
    my @attachments = $self->{meta}->find('FILEATTACHMENT');
    my @attNames = map {$_->{name}} @attachments;

    $indexer->deleteByQuery("type:task task_id_s:$self->{id}"); # our context might have moved

    my $doc = $indexer->newDocument();
    $doc->add_fields(
      'id' => $self->{id} . '@' . $self->{fields}{Context},
      'type' => 'task',
      'language' => $language,
      'web' => $web,
      'topic' => $topic,
      'webtopic' => $webtopic,
      'createdate' => $created,
      'date' => $created,
      'title' => $self->{fields}{Title},
      'text' => $text,
      'url' => $taskurl,
      'author' => $self->{fields}{Author},
      'contributor' => $self->{fields}{Author},
      'state' => $self->{fields}{Status},
      'icon' => $icon,
      'container_id' => $self->{fields}{Context},
      'container_url' => $ctxurl,
      'container_title' => $self->{fields}{Title},
      'container_title_escaped_s' => $indexer->escapeHtml($self->{fields}{Title}),
      'task_created_dt' => $created,
      'task_due_dt' => $date,
      'task_state_s' => $state,
      'task_type_s' => $type,
      'task_id_s' => $self->{id},
      'task_context_s' => $self->{fields}{Context},
      'attachment' => \@attNames,
      'author_s' => Foswiki::Func::expandCommonVariables("%RENDERUSER{\"$self->{fields}{Author}\"}%", $topic, $web)
    );

    my $ignoreContextACL = $self->getBoolPref('IGNORE_CONTEXT_ACL') || 0;
    my $ignoreWikiACL = $self->getBoolPref('IGNORE_WIKI_ACL') || 0;
    my @acl = _getACL($self->{meta}, $self->{form}, 'VIEW');
    my ($granted, $denied);
    unless (scalar @acl) {
        if($ignoreContextACL) {
            $granted = ['all'];
            $denied = [];
        } else {
            my @fromIndexer = topicACL($indexer, $web, $topic);
            $granted = $fromIndexer[0];
            $denied = $fromIndexer[1];
        }
    } else {
        # Unfortunately we can not reproduce our ACLs with this completely.
        # The Wiki only supports one ACL, not multiple. This means, that a
        # 'deny' from one $wikiACL also applies to another $wikiACL and
        # even the list of users.
        # So if we have the ACL string 'UserOne, $wikiACL(MyTopic)' and we
        # set DENYTOPICVIEW=UserOne in MyTopic, the user wil not find this
        # task via Solr.

        my $mapping = $Foswiki::Plugins::SESSION->{users}->{mapping};
        my $cuidConverter = $mapping->can('loginOrGroup2cUID'); # this is a UnifiedAuth speciality
        my $aclstring = join(',', @acl);
        $aclstring .= ",\$wikiACL($ctx VIEW)" unless grep(/\$wikiACL\($ctx[^\)]+\)/, @acl);
        my $fromCache = Foswiki::Plugins::TasksAPIPlugin::_cachedACLExpands($aclstring);
        if($fromCache) {
            ($granted, $denied) = @{$fromCache};
        } else {
            my @arr = ();
            foreach my $entry (@acl) {
                next if $entry =~ /Team/;
                if ($entry =~ /^\$wikiACL/) {
                    push @arr, $entry;
                    next;
                }

                if($cuidConverter) {
                    push @arr, &$cuidConverter($mapping, $entry);
                } else {
                    if ( Foswiki::Func::isGroup($entry) ) {
                        my $members = Foswiki::Func::eachGroupMember($entry, {expand => 'true'});
                        while ($members->hasNext()) {
                            my $user = $members->next();
                            push @arr, $user;
                        }
                    } else {
                        push @arr, Foswiki::Func::getWikiName($entry);
                    }
                }
            }

            # unless explicitely defined, we're going to inherit context's ACLs
            my @grantedUsers;
            my @deniedUsers;
            unless ($ignoreContextACL) {
                my @fromIndexer = topicACL($indexer, $web, $topic);
                push @grantedUsers, @{$fromIndexer[0]};
                push @deniedUsers, @{$fromIndexer[1]};
            }

            for (my $i = 0; $i < scalar(@arr); $i++) {
                if(defined $arr[$i]) {
                    if ($arr[$i] =~ /\$wikiACL\($ctx[^\)]+\)/) {
                        $arr[$i] = undef;
                    } elsif ($arr[$i] =~ /\$wikiACL\(([^\)]+) VIEW\)/) {
                        $arr[$i] = undef;
                        unless ($ignoreWikiACL) {
                            my @fromIndexer = topicACL($indexer,
                                Foswiki::Func::normalizeWebTopicName(undef, $1)
                            );
                            push @grantedUsers, @{$fromIndexer[0]};
                            push @deniedUsers, @{$fromIndexer[1]};
                        }
                    }
                }
            }

            my %uniqueGranted;
            my %uniqueDenied;
            push @grantedUsers, grep defined, @arr;
            $granted = [grep !$uniqueGranted{$_}++, @grantedUsers];
            $denied = [grep !$uniqueDenied{$_}++, @deniedUsers];

            Foswiki::Plugins::TasksAPIPlugin::_cacheACLExpands($aclstring, [$granted, $denied]);
        }
    }

    $doc->add_fields('access_granted' => $granted, 'access_denied' => $denied);

    if ( $legacy ) {
        my $collection = $Foswiki::cfg{SolrPlugin}{DefaultCollection} || "wiki";
        $doc->add_fields(
            'collection' => $collection
        );
    }
    try {
        $indexer->add($doc);
        my %extraFields = ('access_granted' => $granted, 'access_denied' => $denied);
        foreach my $key (qw(task_created_dt task_due_dt task_state_s task_type_s task_id_s)) {
            $extraFields{$key} = $doc->value_for($key);
        }

        foreach my $a (@attachments) {
            $self->indexAttachment($indexer, $a, \%extraFields);
        }
    } catch Error::Simple with {
        my $e = shift;
        $indexer->log("ERROR: ".$e->{-text});
    };
}

sub topicACL {
    my ($indexer, $web, $topic) = @_;
    my ($meta) = Foswiki::Func::readTopic($web, $topic);
    my %acls = $indexer->getAclFields($web, $topic, $meta);
    return ($acls{access_granted}, $acls{access_denied});
}

sub indexAttachment {
    my ($self, $indexer, $attachment, $commonFields) = @_;

    my ($web, $topic) = Foswiki::Func::normalizeWebTopicName(undef, $self->{id});
    my $name = $attachment->{'name'} || '';
    my $extension = '';
    my $title = $name;
    if ($name =~ /^(.+)\.(\w+?)$/) {
        $title = $1;
        $extension = lc($2);
    }

    $title =~ s/_+/ /g;
    $extension = 'jpg' if $extension =~ /jpe?g/i;

    my $indexextensions = $indexer->indexExtensions();
    my $attText = '';
    if ($indexextensions->{$extension}) {
        $attText = $indexer->getStringifiedVersion($web, $topic, $name);
        $attText = $indexer->plainify($attText, $web, $topic);
    }

    my $doc = $indexer->newDocument();
    my @contributors = $indexer->getContributors($web, $topic, $attachment);
    my %contributors = map {$_ => 1} @contributors;
    $doc->add_fields(contributor => [keys %contributors]);

    my $author = Foswiki::Func::getWikiName($attachment->{user}) || 'UnknownUser';
    my $file = Foswiki::urlEncode($name);
    my $url = "$Foswiki::cfg{ScriptUrlPath}/rest$Foswiki::cfg{ScriptSuffix}/TasksAPIPlugin/download?id=$self->{id}&file=$file";
    my ($ctxWeb, $ctxTopic) = Foswiki::Func::normalizeWebTopicName(undef, $self->{fields}{Context});
    my $language = Foswiki::Func::getPreferencesValue('CONTENT_LANGUAGE') || "en";

    $doc->add_fields(
        id => "$web.$topic.$name\@$self->{fields}{Context}",
        language => $language,
        url => $url,
        web => $ctxWeb,
        topic => $ctxTopic,
        webtopic => "$ctxWeb.$ctxTopic",
        title => $title,
        type => $extension,
        text => $attText,
        summary => '',
        author => $author,
        date => Foswiki::Func::formatTime($attachment->{'date'} || 0, 'iso', 'gmtime'),
        version => $attachment->{'version'} || 1,
        name => $name,
        name_escaped_s => $indexer->escapeHtml($name),
        comment => $attachment->{'comment'} || '',
        size => $attachment->{'size'} || 0,
        icon => $indexer->mapToIconFileName($extension),
        container_id => $self->{fields}{Context},
        container_web => $ctxWeb,
        container_topic => $ctxTopic,
        container_url => Foswiki::Func::getViewUrl($ctxWeb, $ctxTopic) . "?id=$self->{id}",
        container_title => $self->{fields}{Title},
        container_title_escaped_s => $indexer->escapeHtml($self->{fields}{Title}),
        task_context_s => $self->{fields}{Context},
        author_s => Foswiki::Func::expandCommonVariables("%RENDERUSER{\"$attachment->{user}\"}%", $ctxTopic, $ctxWeb)
    );

    # add extra fields, i.e. ACLs
    $doc->add_fields(%$commonFields) if $commonFields;

    try {
        $indexer->add($doc);
    }
    catch Error::Simple with {
        my $e = shift;
        $indexer->log("ERROR: " . $e->{-text});
    };
}

sub _formatSolrDate {
    my $date = shift;
    if ( $date =~ /^\d+$/ ) {
        $date = Foswiki::Time::formatTime($date, 'iso', 'gmtime');
    } elsif ( $date =~ /^\d+\s\w+\s\d+$/ ) {
        my $epoch = Foswiki::Time::parseTime($date, $Foswiki::cfg{DisplayTimeValues});
        $date = Foswiki::Time::formatTime($epoch, 'iso', 'gmtime');
    }

    return $date;
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

