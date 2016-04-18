package TasksAPIPluginSeleniumTestCase;

use strict;
use warnings;

use Error qw(:try);
use Foswiki::Func;
use Foswiki::Serialise;
use Foswiki::Plugins::TasksAPIPlugin;
use Foswiki::Plugins::TasksAPIPlugin::Task;
use Selenium::Remote::WDKeys;

use ModacSeleniumTestCase;
our @ISA = qw(ModacSeleniumTestCase);

our $depsChecked = 0;

sub new {
  my ($class, @args) = @_;
  my $self = shift()->SUPER::new('TasksAPIPluginSeleniumTests', @args);
  $self->{test_form} = $self->{test_topic} . 'Form';
  return $self;
}

sub set_up {
  my $this = shift;
  $this->SUPER::set_up(@_);

  $this->checkConfig();
}

sub tear_down {
  my $this = shift;
  $this->SUPER::tear_down(@_);
}

sub checkConfig {
  return if $depsChecked;

  my $this = shift;
  my $dbweb = $Foswiki::cfg{TasksAPIPlugin}{DBWeb} || 'Tasks';
  $this->assert(Foswiki::Func::webExists($dbweb), "Specified DBWeb does not exist.");
  $depsChecked = 1;
}

sub verify_task_create {
  my $this = shift;
  my @tasks = $this->createTasks(10);
  $this->assert(scalar(@tasks) eq 10);

  foreach my $task (@tasks) {
    $task->update(Status => "deleted");
  }
}

sub verify_task_update {
  my $this = shift;

  my $task = $this->createSingleTask();
  my $id = $task->{id};

  my $title = 'My awesome title text!!!';
  $task->update(Title => $title, Status => 'deleted');

  $task = $this->taskById($id);
  $this->assert($task->{fields}{Title} eq $title);
}

sub verify_task_changesets {
  my $this = shift;

  my $task = $this->createSingleTask();
  my $id = $task->{id};

  $task->update(Status => 'deleted');
  $task->update(DueDate => time + 1);
  $task = $this->taskById($id);

  my @changes = $task->{meta}->find('TASKCHANGESET');
  $this->assert(scalar(@changes) eq 2);
}

sub verify_task_close {
  my $this = shift;

  my $task = $this->createSingleTask();
  $task->close();

  $task = $this->taskById($task->{id});
  $this->assert($task->{fields}{Status} eq 'closed');

  my $closed = $task->{fields}{Closed};
  $this->assert(defined $closed);

  $task->update(Status => 'deleted');
}

sub verify_task_parent {
  my $this = shift;

  my ($parent, $child) = $this->createTasks(2);
  my ($pid, $cid) = ($parent->{id}, $child->{id});

  $child->update(Parent => $parent->{id});
  $child = $this->taskById($cid);
  $parent = $child->parent();

  $this->assert($child->{fields}{Parent} eq $parent->{id});

  $child->update(Status => 'deleted');
  $parent->update(Status => 'deleted');
}

sub verify_task_children {
  my $this = shift;

  my $childCount = 3;
  my $parent = $this->createSingleTask();
  $parent->update(Status => 'deleted');

  my @children = $this->createTasks($childCount);
  foreach my $child (@children) {
    $child->update(Parent => $parent->{id}, Status => 'deleted');
  }

  my $res = $parent->children();
  $this->assert($childCount eq $res->{total});
  @children = @{$res->{tasks}};
  my @cids = map {$_->{id}} @children;
  foreach my $child (@children) {
    $this->assert(scalar(grep(/$child->{id}/, @cids)));
  }
}

sub verify_task_search {
  my $this = shift;

  my $cnt = 10;
  my $time = time;
  my $due = $time + 7200;
  my $title = "My awesome title text: $time";
  my @tasks = $this->createTasks($cnt, $due);
  foreach my $task (@tasks) {
    $task->update(Title => $title, Status => 'deleted');
  }

  my @queries = (
    {query => {
      Title => $title,
      Status => 'deleted'
    }},
    {query => {
      Status => 'deleted',
      Title => {
        type => 'like',
        substring => "text: $time"
      }
    }},
    {query => {
      Status => 'deleted',
      DueDate => {
        type => 'range',
        from => $due - 1,
        to => $due + 1
      }
    }}
  );

  foreach my $q (@queries) {
    my $res = Foswiki::Plugins::TasksAPIPlugin::Task::search(query => $q->{query});
    $this->assert($cnt eq $res->{total});
    foreach my $task (@{$res->{tasks}}) {
      $this->assert($title eq $task->{fields}{Title});
    }
  }
}

sub taskById {
  my ($this, $id) = @_;

  my $res = Foswiki::Plugins::TasksAPIPlugin::Task::search(query => {id => $id});
  $this->assert(defined $res);
  $this->assert($res->{total} eq 1);
  my @tasks = @{$res->{tasks}};
  $tasks[0];
}

sub createForm {
  my $this = shift;

  my $formText = <<TEXT;
| *Name* | *Type* | *Size* | *Values* | *Tooltip message* | *Attributes* |
| TopicType | text | 10 | task | | M H |
| Context | text | 10 | | Superior minutes | M H |
| Parent | text | 10 | | | H |
| Author | text | 10 | %RENDERUSER{format="\$cUID"}% | Task "creator" | M H |
| Created | date | 10 | %GMTIME{"\$epoch"}% | Time of creation | M H |
| Changed | date | 10 | %GMTIME{"\$epoch"}% | Time of most recent change | H |
| Closed | date | 10 | | | H |
| Status | select+values | | %MAKETEXT{"open"}%=open,%MAKETEXT{"closed"}%=closed,%MAKETEXT{"deleted"}%=deleted | Status | |
| Title | text | 95 | | Title | M |
| AssignedTo | user | 20 | | Assigned to | M |
| Description | taskeditor | 50 | | Description | |
| DueDate | date2 | 10 | | Due | |
| Informees | user+multi | 50 | | Persons to notify on changes | |
| Prioritize | select+values | | %MAKETEXT{"no"}%=No,%MAKETEXT{"yes"}%=Yes | High priority | |
| Type | select+values | | %MAKETEXT{"Task"}%=Task,%MAKETEXT{"Decision"}%=Decision,%MAKETEXT{"Information"}%=Information | Type | |

   * Set TASKCFG_HAS_CHILDREN = 0
   * Set TASKCFG_TASK_TYPE = test_task
TEXT

  $this->login();
  $this->becomeAnAdmin();

  my $web = $this->{test_web};
  my $topic = $this->{test_form};
  my $meta = Foswiki::Meta->new($Foswiki::Plugins::SESSION, $web, $topic);
  Foswiki::Serialise::deserialise($formText, 'Embedded', $meta);

  my %options = (dontlog => 1, minor => 1, nohandlers => 1);
  $meta->saveAs($web, $topic, %options);
}

sub createTasks {
  my $this = shift;
  my $count = shift;
  my $due = shift || time + 3600;

  unless (Foswiki::Func::topicExists($this->{test_web}, $this->{test_form})) {
    $this->createForm();
  }

  my @tasks = ();
  for (my $i = 0; $i < $count; $i++) {
    my $task = Foswiki::Plugins::TasksAPIPlugin::Task::create(
      form => "$this->{test_web}.$this->{test_form}",
      Context => "$this->{test_web}.$this->{test_topic}",
      Title => "Task-" . ($i+1),
      Status => 'open',
      TopicType => 'task',
      Author => $Foswiki::cfg{UnitTestContrib}{SeleniumRc}{Username},
      AssignedTo => $Foswiki::cfg{UnitTestContrib}{SeleniumRc}{Username},
      DueDate => $due,
      Type => 'Task'
    );

    push(@tasks, $task);
  }

  @tasks;
}

sub createSingleTask {
  my $this = shift;
  my $due = shift;
  my @tasks = $this->createTasks(1, $due);
  $tasks[0];
}

1;

