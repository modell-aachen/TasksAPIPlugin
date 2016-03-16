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
  my @tasks = $this->createTasks(1);
  $this->assert(scalar(@tasks) eq 1 );

  # crash!!
  foreach my $task (@tasks) {
    $task->update(Status => "deleted");
  }
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
      Created => time,
      Changed => time,
      DueDate => time + $i*3600,
      Type => 'Task'
    );

    push(@tasks, $task);
  }

  @tasks;
}

1;

