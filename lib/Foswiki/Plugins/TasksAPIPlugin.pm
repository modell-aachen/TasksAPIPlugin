# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Contrib::JsonRpcContrib ();

use Foswiki::Plugins::TasksAPIPlugin::Task;
use Foswiki::Plugins::SolrPlugin::Search;

use JSON;

our $VERSION = '0.1';
our $RELEASE = '0.1';
our $SHORTDESCRIPTION = 'Empty Plugin used as a template for new Plugins';
our $NO_PREFS_IN_TOPIC = 1;

my $solr;

sub initPlugin {
    my ( $topic, $web, $user, $installWeb ) = @_;

    # check for Plugins.pm versions
    if ( $Foswiki::Plugins::VERSION < 2.0 ) {
        Foswiki::Func::writeWarning( 'Version mismatch between ',
            __PACKAGE__, ' and Plugins.pm' );
        return 0;
    }

#    Foswiki::Contrib::JsonRpcContrib::registerMethod(
#        'tasks', 'query',
#        \&_query
#    );
#    Foswiki::Func::registerTagHandler( 'EXAMPLETAG', \&_EXAMPLETAG );
    Foswiki::Func::registerRESTHandler( 'create', \&restCreate );
    Foswiki::Func::registerRESTHandler( 'multicreate', \&restMultiCreate );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate );
#XXX- we don't really want to delete anything
#    Foswiki::Func::registerRESTHandler( 'delete', \&restDelete );

    if ($Foswiki::cfg{Plugins}{SolrPlugin}{Enabled}) {
      require Foswiki::Plugins::SolrPlugin;
      Foswiki::Plugins::SolrPlugin::registerIndexTopicHandler(
        \&_indexTopicHandler
      );
    }

    # Plugin correctly initialized
    return 1;
}

sub finishPlugin {
    undef $solr;
}

sub _query {
    $solr ||= Foswiki::Plugins::SolrPlugin::Search->new($Foswiki::Plugins::SESSION);
    $solr->solrSearch(@_);
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

    my @acl = _getACL($task->{meta}, 'change');
    if (@acl) {
        unless (_checkACL(@acl)) {
            return '{"status":"error","code":"acl_change","msg":"No permission to update task"}';
        }
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
        my @acl = _getACL($task->{meta}, 'change');
        $res{$id} = {status => 'error', 'code' => 'acl_change', msg => "No permission to update task"} if @acl && !_checkACL(@acl);
    }
    return encode_json(\%res);
}

sub _indexTopicHandler {
    my ($indexer, $doc, $web, $topic, $meta, $text) = @_;

    my $isTask = $doc->value_for('field_TopicType_lst');
    return unless $isTask && $isTask eq 'task';
    for my $f ($doc->fields) {
        next if $f->name ne 'type';
        $f->value('task');
        last;
    }
    $doc->add_fields(
        task_fulltext_s => $text,
    );
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
