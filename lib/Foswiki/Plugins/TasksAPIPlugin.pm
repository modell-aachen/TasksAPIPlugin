# See bottom of file for default license and copyright information

package Foswiki::Plugins::TasksAPIPlugin;

use strict;
use warnings;

use Foswiki::Func ();
use Foswiki::Plugins ();
use Foswiki::Contrib::JsonRpcContrib ();

use Foswiki::Plugins::JQueryPlugin;
use Foswiki::Plugins::SolrPlugin::Search;
use Foswiki::Plugins::TasksAPIPlugin::Task;

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

    Foswiki::Func::registerTagHandler( 'TASKSGRID', \&tagGrid );

    Foswiki::Func::registerRESTHandler( 'create', \&restCreate );
    Foswiki::Func::registerRESTHandler( 'update', \&restUpdate );
    Foswiki::Func::registerRESTHandler( 'multiupdate', \&restMultiUpdate );

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

sub restUpdate {
    my ($session, $subject, $verb, $response) = @_;
    my $q = $session->{request};
    my %data;
    for my $k ($q->param) {
        $data{$k} = $q->param($k);
    }
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::load($Foswiki::cfg{TasksAPIPlugin}{DBWeb}, delete $data{id});
    # TODO check access
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

my $gridCounter = 1;
sub tagGrid {
    my( $session, $params, $topic, $web, $topicObject ) = @_;

  # $params->{foo}

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName( $web, $topic );
    my $ctx = $params->{_DEFAULT} || $params->{context} || "";
    my $id = $params->{id} || $gridCounter;
    $gridCounter += 1 if $id eq $gridCounter;
    my $state = $params->{state} || "";
    my $system = $Foswiki::cfg{SystemWebName} || "System";
    my $form = $params->{form} || "$system.TasksAPIDefaultTaskForm";
    my $taskTemplate = $params->{tasktemplate} || "tasksapi::task";
    my $editorTemplate = $params->{editortemplate} || "tasksapi::editor";
    my $filterTemplate = $params->{filtertemplate} || "tasksapi::filter";
    my $gridClass = $params->{gridclass} || "";
    my $pageSize = $params->{pagesize} || "";
    my $query = $params->{query} || "";

    Foswiki::Func::loadTemplate( "TasksAPI" );
    my $editor = Foswiki::Func::expandTemplate( $editorTemplate );
    my $task = Foswiki::Func::expandTemplate( $taskTemplate );
    my $filter = Foswiki::Func::expandTemplate( $filterTemplate );

    my %settings = (
        context => $ctx,
        form => $form,
        id => $id,
        pageSize => $pageSize,
        query => $query,
        template => Foswiki::urlEncode( $task )
    );

    my $json = encode_json( \%settings );
    my $grid = <<GRID;
<div id="$id" class="tasktracker $gridClass">
  <div class="filter">
    <div>$filter</div>
  </div>
  <div class="tasks">
    <div></div>
  </div>
  <div class="editor">
    <div>
%BUTTON{"%MAKETEXT{"Save"}%" class="btn-save" icon="accept"}%
%BUTTON{"%MAKETEXT{"Cancel"}%" class="btn-cancel" icon="cross"}%
%CLEAR%
    </div>
    <div>$editor</div>
  </div>
  <div class="settings">$json</div>
</div>
GRID

    my @jqdeps = ("jqp::moment", "jqp::observe", "jqp::underscore");
    foreach (@jqdeps) {
        Foswiki::Plugins::JQueryPlugin::createPlugin( $_ );
    }

    my $pluginURL = '%PUBURLPATH%/%SYSTEMWEB%/TasksAPIPlugin';
    Foswiki::Func::addToZone( 'script', 'TASKSAPI::SCRIPTS', <<SCRIPT, 'JQUERYPLUGIN::JQP::UNDERSCORE' );
<script type="text/javascript" src="$pluginURL/js/tasktracker.js"></script>
SCRIPT

    Foswiki::Func::addToZone( 'head', 'TASKSAPI::STYLES', <<STYLE );
<link rel='stylesheet' type='text/css' media='all' href='$pluginURL/css/tasktracker.css' />
STYLE

    return $grid;
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
