if (!libjuju)
	var libjuju = {};

libjuju.jujuStatusHilight = (function(text, external_json) {
    // Replace agent-state values, use --OK-- as a "marker" for "other" states 
    // (not previously replaced at started or error)
    text = text
        .replace(/([^ ]+"agent-state".*:.*)"(.*started)"/g,
                 '$1<span class=juju-agent-state-ok>"$2"</span><!--OK-->')
        .replace(/([^ ]+"agent-state".*:.*)"(.*error)"/g,
                 '$1<span class=juju-agent-state-error>"$2"</span><!--OK-->')
        .replace(/([^ ]+"agent-state".*:.*)"(.*)"(?!.*--OK--)/g,
                 '$1<span class=juju-agent-state-other>"$2"</span>');
    var machine_url = external_json['machine-url'];
    if (machine_url) {
        text = text
            .replace(/(.*"machine".*:.*")([0-9]+)(".*)/g, '$1<a href="@URL@$2">$2</a>$3')
            .replace(/@URL@/g, machine_url);
    }
    return text;
});
