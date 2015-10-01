# ---+ Extensions
# ---++ TasksAPIPlugin

# **BOOLEAN**
# Pass a collection which was mandatory prior Solr 5 into the Solr Indexer.
# The collection field is deprecated as of Solr 5. In case you're running Solr
# in version prior to 5, you muss set this value to enabled.
$Foswiki::cfg{TasksAPIPlugin}{LegacySolrIntegration} = 0;

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
