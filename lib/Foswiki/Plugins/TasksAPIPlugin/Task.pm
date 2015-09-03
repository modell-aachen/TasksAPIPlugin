# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin::Task;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Form ();

# use Date::Manip;
use Digest::SHA;
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
        my $val = $entry ? $entry->{value} : undef;
        $data{$name} = $val;
    }
    if (!$data{TopicType} || $data{TopicType} ne 'task') {
        die "Alleged task topic '$web.$topic' is not actually a task\n";
    }
    $web =~ s#/#.#g;
    $data{id} = "$web.$topic";
    $data{form} = $form;
    $data{text} = $meta->text;
    $data{meta} = $meta;
    __PACKAGE__->new(%data);
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
        next if !$f || !ref $f || $f->{value} ne 'task';
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

sub _getACL {
    my ($this, $form, $type) = @_;
    my $aclPref = $form->getPreference("TASKACL_\U$type");
    return () unless $aclPref;
    $aclPref = $this->expandMacros($aclPref);
    my @acl;
    my $parent = $this->get('FIELD', 'Parent');
    my $ctx = $this->get('FIELD', 'Context');
    my $aclFromRef = sub {
        my $ref = $this->get('FIELD', shift);
        return () unless $ref;
        my $refedTopic = load(undef, $ref->{value});
        return () unless $refedTopic;
        return _getACL($refedTopic->{meta}, $refedTopic->{form}, $type);
    };
    $aclPref =~ s/\$parentACL\b/push @acl, $aclFromRef->('Parent'); ''/e;
    $aclPref =~ s/\$contextACL\b/\$wikiACL($this->{fields}{Context}{value},$type)/;
    push @acl, grep { $_ } split(/\s*,\s*/, $aclPref);
    my %acl; @acl{@acl} = @acl;
    keys %acl;
}

sub _checkACL {
    my $session = $Foswiki::Plugins::SESSION;
    my $acl = shift;
    return 1 if !@$acl;
    my $user = shift || $session->{user};
    my $aclstring = join(',', @$acl);
    my $cache = Foswiki::Plugins::TasksAPIPlugin::_cachedACL($aclstring);
    return $cache if defined $cache;

    foreach my $item (@$acl) {
        if ($user ne 'BaseUserMapping_666' && $item eq '*') {
            Foswiki::Plugins::TasksAPIPlugin::_cacheACL($aclstring, 1);
            return 1;
        }
        if ($item =~ /\$wikiACL\(([^,]+),([^)]+)\)/) {
            my ($aclwt, $type) = ($1, $2);
            $type = uc $type;
            my $ccache = Foswiki::Plugins::TasksAPIPlugin::_cachedContextACL("$aclwt,$type");
            return $ccache if defined $ccache;

            my ($meta) = Foswiki::Func::readTopic(undef, $aclwt);
            $ccache = $meta->haveAccess("$type");
            Foswiki::Plugins::TasksAPIPlugin::_cacheContextACL("$aclwt,$type", $ccache);
            return $ccache;
        }
        my $cuid = Foswiki::Func::getCanonicalUserID($item);
        if ($user eq $cuid || Foswiki::Func::isGroup($item) && Foswiki::Func::isGroupMember($item, $user)) {
            Foswiki::Plugins::TasksAPIPlugin::_cacheACL($aclstring, 1);
            return 1;
        }
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
    $pref =~ s/\$curvalue\(([^)]+)\)/$task->{fields}{$1}/eg;
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
    $data{TopicType} = 'task';
    foreach my $f (@$fields) {
        my $name = $f->{name};
        my $default = $f->{value};
        $default = $f->getDefaultValue if $f->can('getDefaultValue');
        $meta->putKeyed('FIELD', {
            name => $name, title => $f->{tooltip}, value => defined($data{$name}) ? $data{$name} : $f->{value}
        });
    }

    $meta->saveAs($web, $topic, dontlog => 1, minor => 1);
    my $task = load($meta);

    $task->notify('created');
    $task->_postCreate();
    Foswiki::Plugins::TasksAPIPlugin::_index($task);
    $task;
}

sub notify {
    my ($self, $type, %options) = @_;
    my $notify = Foswiki::Plugins::TasksAPIPlugin::withCurrentTask($self, sub { $self->getPref("NOTIFY_\U$type") });
    return unless $notify;
    my $tpl = $self->getPref("NOTIFY_\U${type}_TEMPLATE") || "TasksAPI\u${type}Mail";

    require Foswiki::Contrib::MailTemplatesContrib;
    Foswiki::Func::pushTopicContext(Foswiki::Func::normalizeWebTopicName(undef, $self->{field}{Context}));
    Foswiki::Func::setPreferencesValue('TASKSAPI_MAIL_TO', $notify);
    Foswiki::Func::setPreferencesValue('TASKSAPI_ACTOR', Foswiki::Func::getWikiName());
    Foswiki::Plugins::TasksAPIPlugin::withCurrentTask($self, sub { Foswiki::Contrib::MailTemplatesContrib::sendMail($tpl) });
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

    my @changes;
    delete $data{TopicType};
    my @comment = delete $data{comment};
    @comment = () if @comment && (!defined $comment[0] || $comment[0] =~ /^\s*$/s);
    my $notify = 'changed';
    foreach my $f (@{ $self->{form}->getFields }) {
        my $name = $f->{name};
        next if !exists $data{$name};
        my $val = $data{$name};
        my $old = $self->{fields}{$name};
        if ($val eq '' && $old ne '') {
            $meta->remove('FIELD', $name);
            delete $self->{fields}{$name};
            push @changes, { type => 'delete', name => $name, old => $old };
            next;
        }
        if ($old eq '' && $val ne '') {
            push @changes, { type => 'add', name => $name, new => $val };
        } elsif ($val ne $old) {
            push @changes, { type => 'change', name => $name, old => $old, new => $val };
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

        $meta->putKeyed('FIELD', { name => $name, title => $f->{tooltip}, value => $val });
        $self->{fields}{$name} = $val;
    }
    if (@comment) {
        unshift @comment, 'comment';
    }

    # Find existing changesets to determine new ID
    if (@changes || @comment) {
        my @changesets = $meta->find('TASKCHANGESET');
        my $newid = @changesets + 1;
        $meta->putKeyed('TASKCHANGESET', {
            name => $newid,
            actor => Foswiki::Func::getWikiName(),
            at => scalar(time),
            changes => to_json(\@changes),
            @comment
        });
        $self->{changeset} = $newid;
    }
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

    Foswiki::Plugins::TasksAPIPlugin::_index($self);
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

sub _postCreate {
    # TODO
}
sub _postClose {
    my $self = shift;
    if (my $reopen = $self->getPref('SCHEDULE_REOPEN')) {
        my $date = new Date::Manip::Date();
        $date->parse($reopen);
        Foswiki::Plugins::TasksAPIPlugin::Job::create(
            type => 'reopen',
            time => $date,
            task => $self,
        );
    }
}
sub _postReopen {
    # TODO
}
sub _postReassign {
    # TODO
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

