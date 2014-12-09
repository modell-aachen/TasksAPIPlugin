# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin::Task;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Form ();

use Digest::SHA;
use JSON;

my $query = \&Foswiki::Plugins::TasksAPIPlugin::_query;

# Create a completely arbitrary task object, with no validation or anything
sub new {
    my $class = shift;
    my %params = @_;
    my $self = bless {}, $class;
    @{$self}{'id', 'form', 'text'} = delete @params{'id','form','text'};
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
    unless ($meta->haveAccess) {
        die "No permission to read task topic '$web.$topic'";
    }

    my $form = $meta->getFormName;
    die "Alleged task topic '$web.$topic' has no form attached to it" unless $form;
    my ($formWeb, $formTopic) = Foswiki::Func::normalizeWebTopicName($web, $form);
    $form = Foswiki::Form->new($Foswiki::Plugins::SESSION, $formWeb, $formTopic);
    die "Can't read form definition '$formWeb.$formTopic' for task topic '$web.$topic'" unless ref $form;

    my $fields = $form->getFields;
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
        for my $filter (@_) {
            next Iter if !$filter->($m);
        }
        push @res, load($m);
    }
    @res;
}

# Initialize a task object from a Solr document
sub _loadSolr {
    my $doc = shift;
    my ($web, $topic) = ($doc->value_for('web'), $doc->value_for('topic'));
    my $type = $doc->value_for('type');
    die "Attempted to load non-task '$web.$topic' as task" unless $type && $type eq 'task';

    my ($form, $fields) = _loadForm($web, $topic);
    my %data;
    foreach my $f (@$fields) {
        my $name = $f->{name};
        my $entry = $doc->value_for("field_${name}_s", $name);
        my $val = $entry ? $entry->{value} : undef;
        $data{$name} = $val;
    }
    $web =~ s#/#.#g;
    $data{id} = "$web.$topic";
    $data{text} = $doc->value_for('task_fulltext_s');
    $data{form} = $form;
    __PACKAGE__->new(%data);
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

# Parse out key-value settings from a preference
sub _parsePref {
    my ($meta, $name) = @_;
    my %res;
    my @res = split(/\|/, $meta->getPreference('TASKCFG_'. $name) || '');
    for my $r (@res) {
        $r =~ s#^\s*|\s*$##gs;
        next unless $r =~ /=/;
        my ($k, $v) = split(/=/, $r, 2);
        $res{$k} = $v;
    }
    %res;
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
        $meta->putKeyed('FIELD', {
            name => $name, title => $f->{tooltip}, value => defined($data{$name}) ? $data{$name} : $f->{value}
        });
    }
    if (my %autonumber = _parsePref($form, 'AUTONUMBER')) {
        # can't query Solr here because it may be outdated :(
        # so, iterate over all topics.
        my $siblings = _getSiblings($data{Context}, $data{Parent});
    }
    $meta->saveAs($web, $topic, dontlog => 1, minor => 1);
    load($meta);
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
    foreach my $f (@{ $self->{form}->getFields }) {
        my $name = $f->{name};
        next if !exists $data{$name};
        my $val = $data{$name};
        my $old = $self->{fields}{$name};
        if (!defined $val && defined $old) {
            $meta->remove('FIELD', $name);
            delete $self->{fields}{$name};
            push @changes, { type => 'delete', name => $name, old => $old };
            next;
        }
        if (!defined $old) {
            push @changes, { type => 'add', name => $name, new => $val };
        } elsif ($val ne $old) {
            push @changes, { type => 'change', name => $name, old => $old, new => $val };
        }
        $meta->putKeyed('FIELD', { name => $name, title => $f->{tooltip}, value => $val });
        $self->{fields}{$name} = $val;
    }
    # TODO record changeset
    # TODO implement PRIMARYFIELDS (e.g.) pref to restrict which fields will
    # show up in changesets; we don't want to be updated about
    # auto-renumbering, for example
    $meta->saveAs($web, $topic, dontlog => 1, minor => 1);
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
    my $self = shift;
    my @res;
    my $data = Foswiki::Plugins::TasksAPIPlugin::_query('{!edismax}type:task field_Parent_s='. $self->{id});

    for my $doc ($data->docs) {
        push @res, _loadSolr($doc);
    }
    @res;
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

