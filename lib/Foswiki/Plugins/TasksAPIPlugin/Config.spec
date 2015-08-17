# ---+ Extensions
# ---++ TasksAPIPlugin

# **STRING**
# The name of the web used for storing tasks (auto-created by the plugin if necessary)
$Foswiki::cfg{TasksAPIPlugin}{DBWeb} = 'Tasks';

# **BOOLEAN**
$Foswiki::cfg{TasksAPIPlugin}{Debug} = 0;

# ---++ JQueryPlugin
# ---+++ TasksAPI

# **BOOLEAN**
$Foswiki::cfg{JQueryPlugin}{Plugins}{TasksAPI}{Enabled} = 1;

# **STRING EXPERT**
$Foswiki::cfg{JQueryPlugin}{Plugins}{TasksAPI}{Module} = 'Foswiki::Plugins::TasksAPIPlugin::JQueryPlugin';
