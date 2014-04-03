if (!lib)
	var lib = {};
// get an URL parameter by its name
lib.getParameterByName = (function(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
});

// get an URL parameter by its name, with default_value
lib.getParameterByNameDef = (function (name, default_value) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    if (match)
        return decodeURIComponent(match[1].replace(/\+/g, ' '));
    else
        return default_value;
});

// shortcut function to return filename from: ?file=filename
lib.getFile = (function() {
    return lib.getParameterByName("file");
});


// set the new file to display, will force a page + app reload
lib.setFile = (function(file) {
    window.location.href = window.location.href.split('?')[0]+ '?file=' + file;
});

// Credits: http://jsfiddle.net/unLSJ/
lib.json = {
   replacer: function(match, pIndent, pKey, pVal, pEnd) {
      var key = '<span class=json-key>';
      var val = '<span class=json-value>';
      var str = '<span class=json-string>';
      var r = pIndent || '';
      if (pKey)
         r = r + key + '"' + pKey.replace(/[": ]/g, '') + '"' + '</span>: ';
      if (pVal)
         r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
      return r + (pEnd || '');
      },
   prettyPrint: function(obj) {
      var jsonLine = /^( *)("[\w-]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
      return JSON.stringify(obj, null, 3)
         .replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
         .replace(/</g, '&lt;').replace(/>/g, '&gt;')
         .replace(jsonLine, lib.json.replacer);
      }
   };

lib.jujuHilight = (function(text, json) {
    // Replace agent-state values, use --X-- as a "marker" for "other" states 
    // (not previously replaced at started or error)
    text = lib.json.prettyPrint(text);
    text = text
        .replace(/([^ ]+agent-state.*:.*)"(.*started)"/g,
                 '$1<span class=juju-agent-state-ok>"$2"</span><!--X-->')
        .replace(/([^ ]+agent-state.*:.*)"(.*error)"/g,
                 '$1<span class=juju-agent-state-error>"$2"</span><!--X-->')
        .replace(/([^ ]+agent-state.*:.*)"(.*)"(?!.*--X--)/g,
                 '$1<span class=juju-agent-state-other>"$2"</span>');
    var machine_url = json['machine-url'];
    if (machine_url) {
        text = text
            .replace(/(.*"machine".*:.*")([0-9]+)(".*)/g, '$1<a href="@URL@$2">$2</a>$3')
            .replace(/@URL@/g, machine_url);
    }
    return text;
});

