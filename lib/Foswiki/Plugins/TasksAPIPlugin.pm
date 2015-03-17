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

    ($web, $topic) = Foswiki::Func::normalizeWebTopicName( $web, $topic );
    my $ctx = $params->{_DEFAULT} || $params->{context} || "$web";
    my $id = $params->{id} || $gridCounter;
    $gridCounter += 1 if $id eq $gridCounter;
    my $system = $Foswiki::cfg{SystemWebName} || "System";
    my $form = $params->{form} || "$system.TasksAPIDefaultTaskForm";
    my $taskTemplate = $params->{tasktemplate} || "tasksapi::task";
    my $editorTemplate = $params->{editortemplate} || "tasksapi::editor";
    my $captionTemplate = $params->{captiontemplate} || "tasksapi::caption";
    my $filterClass = $params->{filterclass} || "";
    my $captionClass = $params->{captionclass} || "";
    my $extraClass = $params->{extraclass} || "";
    my $states = $params->{states} || '%MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed';
    my $pageSize = $params->{pagesize} || 100;
    my $query = $params->{query} || "";
    my $stateless = $params->{stateless} || 0;
    my $title = $params->{title} || '%MAKETEXT{"Tasks"}%';
    my $createText = $params->{createlinktext} || '%MAKETEXT{"Add task"}%';
    my $templateFile = $params->{templatefile} || 'TasksAPI';
    my $allowCreate = $params->{allowcreate} || 0;
    my $allowUpload = $params->{allowupload} || 0;
    my $showAttachments = $params->{showattachments} || 0;
    $templateFile =~ s/Template$//;

    Foswiki::Func::loadTemplate( $templateFile );
    my $editor = Foswiki::Func::expandTemplate( $editorTemplate );
    my $caption = Foswiki::Func::expandTemplate( $captionTemplate );
    my $task = Foswiki::Func::expandTemplate( $taskTemplate );

    my %settings = (
        context => $ctx,
        form => $form,
        id => $id,
        pageSize => $pageSize,
        query => $query,
        stateless => $stateless,
        template => Foswiki::urlEncode( $task )
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
<div id="$id" class="tasktracker $extraClass">
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
        <div>$editor</div>
        <div $showAttachmentsStyle>
            %TWISTY{showlink="%MAKETEXT{"Show attachments"}%" hidelink="%MAKETEXT{"Hide attachments"}%" start="hide"}%
            %ENDTWISTY%
        </div>
        <div $allowUploadStyle>
            %TWISTY{showlink="%MAKETEXT{"Attach file(s)"}%" hidelink="%MAKETEXT{"Hide"}%" start="hide"}%
            %DNDUPLOAD{extraclass="full-width"}%
            %ENDTWISTY%
        </div>
        <div>
            <a href="#" class="tasks-btn tasks-btn-save">%MAKETEXT{"Save"}%</a>
            <a href="#" class="tasks-btn tasks-btn-cancel">%MAKETEXT{"Cancel"}%</a>
        </div>
    </div>
</div>
GRID

    my @jqdeps = ("jqp::moment", "jqp::observe", "jqp::underscore", "tasksapi", "ui::accordion", "ui::dialog");
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

1;

__END__
Q.Wiki Tasks API - Modell Aachen GmbH

Author: %$AUTHOR%

Copyright (C) 2015 Modell Aachen GmbH

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version. For
more details read LICENSE in the root of this distribution.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

As per the GPL, removal of this notice is prohibited.
