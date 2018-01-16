#!/usr/bin/env perl
use strict;
use warnings;

use JSON;

use Getopt::Long;
use Pod::Usage;

# Set library paths in @INC, at compile time
BEGIN {
  if (-e './setlib.cfg') {
    unshift @INC, '.';
  } elsif (-e '../bin/setlib.cfg') {
    unshift @INC, '../bin';
  }
  require 'setlib.cfg';
}

use Foswiki ();
use Foswiki::Meta ();
use Foswiki::Serialise::Embedded ();

my ($host, $help, $man, $datadir, $nodry);
my $verbose = 0;
GetOptions (
    'host=s' => \$host,
    'help|h' => \$help,
    'man' => \$man,
    'nodry|i' => \$nodry,
    'verbose|i' => \$verbose,
) or pod2usage(2);

pod2usage(1) if $help;
pod2usage(-verbose => 4) if $man;

my $hostname = $host || $ENV{host};

sub updateTasksAndHistory {
    my $taskDir = "$Foswiki::cfg{DataDir}/Tasks";
    print STDOUT "checking Tasks-directory $taskDir\n" if $verbose;
    unless ( -e $taskDir && -d $taskDir ) {
        die "Could not find Tasks-directory, looked in $taskDir";
    }

    opendir (DIR, $taskDir) or die "Failed to open tasks-directory: $!";
    while (my $file = readdir(DIR)) {
        unless ($file =~ m#^(Task-[a-z0-9]+)\.txt$#) {
            print STDOUT "skipping non-task $file\n" if $verbose > 1;
            next;
        }
        my $histDir = "$taskDir/$1,pfv";
        updateTaskFile("$taskDir/$file");
        unless ( -e $histDir && -d $histDir ) {
            print STDOUT "task has no history: $file\n" if $verbose;
        }
        unless (opendir (HIST, $histDir)) {
            print STDERR "Could not open history dir $histDir\n";
            next;
        }
        while (my $histItem = readdir(HIST)) {
            unless ( $histItem =~ m#^\d+$# ) {
                print STDOUT "skipping non-history file $histItem\n" if $verbose > 1;
                next;
            }
            updateTaskFile("$histDir/$histItem");
        }
    }
}

sub updateChangeSet {
    my $changes = shift;

    print STDOUT "updating changeset '$changes'" if $verbose > 2;

    my $json;
    eval {
        $json = Foswiki::Meta::dataDecode($changes);
    };
    if($@) {
        print STDERR "Error while decoding json ($changes): $@\n";
        return $changes;
    }
    eval {
        my $data = from_json($json);
        my $dirty;
        foreach my $set ( @$data ) {
            unless ( ref $set ) {
                use Data::Dumper;
                print STDERR "Error parsing set " . Dumper($set);
                next;
            }
            next unless $set->{name} && $set->{name} eq '_attachment';
            next if $set->{hist_version};

            $dirty = 1;
            last;
        }
        if ( $dirty ) {
            print STDOUT "re-encoding changeset\n" if $verbose;
            $data = decode_json($json);
            foreach my $set (@$data) {
                $set->{hist_version} = 2 if $set->{name} && $set->{name} eq '_attachment';
            }
            $json = to_json($data);
            $changes = Foswiki::Serialise::Embedded::dataEncode($json);
        } else {
            print STDOUT "changeset is ok\n" if $verbose > 2;
        }
    };
    if($@) {
        print STDERR "Error while processing json ($json): $@\n";
    }

    return $changes;
}

sub updateTaskFile {
    my $file = shift;

    print STDOUT "Treating file $file\n" if $verbose;

    my $fh;
    unless ( open ($fh, "<:encoding(UTF-8)", $file) ) {
        print STDERR "Could not read file $file: $!\n";
        return;
    };

    local $/ = undef;
    my $text = <$fh>;
    unless($text) {
        print STDERR "Could not read file $file (no content)\n";
        return;
    }
    close $fh;

    my $changedText = $text =~ s#^(%META:TASKCHANGESET{.*\bchanges=")([^"]+)"#$1 . updateChangeSet($2) . '"'#gmer;
    if($changedText eq $text) {
        print STDOUT "nothing to do\n" if $verbose;
    } else {
        unless ( $nodry ) {
            print STDOUT "Dry-run: would update $file\n";
            return;
        }
        print STDOUT "writing changes to file $file\n";
        $changedText = Foswiki::encode_utf8($changedText);
        my $updatedFile = "$file.update";
        unless ( open ($fh, ">", $updatedFile) ) {
            print STDERR "Could not open file for writing: $updatedFile\n";
            return;
        };
        print $fh $changedText;
        unless ( close $fh ) {
            print STDERR "Could not close filehandle for $updatedFile\n";
            return;
        }
        rename $updatedFile, $file;
    }
}

if ($hostname) {
    require Foswiki::Contrib::VirtualHostingContrib;
    require Foswiki::Contrib::VirtualHostingContrib::VirtualHost;
    if ($hostname eq 'all') {
      Foswiki::Contrib::VirtualHostingContrib::VirtualHost->run_on_each(\&updateTasksAndHistory);
    } else {
      Foswiki::Contrib::VirtualHostingContrib::VirtualHost->run_on($hostname, \&updateTasksAndHistory);
    }
} else {
    updateTasksAndHistory()
}

print STDOUT "\nDone, " . ( $nodry ? 'please run taskindex now' : 'dry-run: nothing has been changed' ) . "\n";

__END__


=head1 NAME

Update tasks history for attachments for correct encoding. This script may be safely run multiple times.

=head1 SYNOPSIS

perl update_tasks_history [options]

    Options:
     -help|h        help
     -host          specify host for VirtualHostingContrib
     -man           print documentation
     -nodry         do not simulate
     -verbose       lots of output

=head1 OPTIONS

=over 4

=item B<-host>

Use VirtualHostingContrib and convert this host only. To convert all hosts use 'all'.

 Examples:
  convert_ua_users -host=my.host.com
  convert_ua_users -host=all

You can also set the environment variable 'host'.

 Example:
 host=my.host.com convert_ua_users

=item B<-nodry>

Actually do stuff. Without this option, nothing will be written to disk.

=item B<-verbose>

Verbose output, mainly for debugging. Set to 2 for very verbose output.

=item B<-help|h>

Prints a brief help message and exits.

=item B<-man>

Prints the manual page and exits.

=back

=head1 DESCRIPTION

B<This script> will update the changesets of attachments in tasks to UTF-8 encoding.

=cut


