if (!lib)
	var lib = {};
// get an URL parameter by its name
lib.getParameterByName = (function(name) {
    var match = RegExp('[?&]' + name + '=([^&?]*)').exec(window.location.search);
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
    file = lib.getParameterByName("file");
    if (file)
	file = file.replace(/\/$/, "")
    return file
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

lib.noCache = (function(url) {
	return url + "?_" + (new Date).getTime();
});
lib.notify_icon_OK = "http://openiconlibrary.sourceforge.net/gallery2/open_icon_library-full/icons/png/32x32/status/dialog-clean.png";
lib.notify_icon_ALERT = "http://openiconlibrary.sourceforge.net/gallery2/open_icon_library-full/icons/png/32x32/status/dialog-important-2.png"
lib.notify = (function(msg, icon) {
    // Let's check if the browser supports notifications
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
    }

    // Let's check if the user is okay to get some notification
    // Note, Chrome does not implement the permission static property
    // So we have to check for NOT 'denied' instead of 'default'
    if (Notification.permission !== 'denied') {
        Notification.requestPermission(function (permission) {
            // Whatever the user answers, we make sure we store the information
            if(!('permission' in Notification)) {
                Notification.permission = permission;
            }
        });
    }
    if (Notification.permission === "granted") {
        // If it's okay let's create a notification
        var notification = new Notification(msg, { icon: icon});
    }

// At last, if the user already denied any notification, and you 
// want to be respectful there is no need to bother him any more.
});

// lib.favicon_note('2', 'red');
// lib.favicon_note('0', 'lightgreen);
lib.favicon_note = (function(str, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 16;canvas.height = 16;
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.src = lib.noCache('/favicon.ico');
    img.onload = function() {
        ctx.drawImage(img, 0, 0);
        ctx.fillStyle = color;
        ctx.fillRect(6, 4, 20, 20);
	if (str) {
		ctx.fillStyle = "black";
		ctx.font = 'bold 14px sans-serif';
		ctx.fillText(str, 7, 14);
		ctx.fillStyle = "white";
		ctx.font = 'bold 13px sans-serif';
		ctx.fillText(str, 8, 15);
	}
        var link = document.createElement('link');
        var old_link = document.getElementById('dynamic-favicon');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
	link.id = 'dynamic-favicon';
        link.href = canvas.toDataURL("image/x-icon");
	if (old_link) {
		document.head.removeChild(old_link);
	}
        document.getElementsByTagName('head')[0].appendChild(link);
    }
});
