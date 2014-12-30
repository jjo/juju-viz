# Use pre-downloaded external resources, by (sed) editing juju-viz.html
# to replace external http://hostname/resource.js by ext/resource.js
# (and .css)
# Order is important:
# - DO:    make ext-dload ext-edit
# - UNDO:  make ext-restore ext-clean
ext-clean:
	rm -f *.css *.js

ext-dload:
	egrep '(link.*rel|script).*http' ../juju-viz.html |egrep -o 'http[^"]+'| xargs -tr wget -c
	sha1sum *.js *.css > SHA1SUMS

ext-check:
	sha1sum -c SHA1SUMS

ext-edit:
	# edit external resources to be "ext/filename"
	test    -f ../juju-viz.html.orig-ext_ok || sed -ri.orig-ext_ok 's!(https?://)([a-z0-9.-]+/)+(.*)!ext/\3!' ../juju-viz.html

ext-restore:
	# restore original main HTML
	test ! -f ../juju-viz.html.orig-ext_ok || mv ../juju-viz.html.orig-ext_ok ../juju-viz.html
