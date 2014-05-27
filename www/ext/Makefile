# Allow using pre-downloaded external resources
ext-clean:
	rm -f *.css *.js

ext-dload:
	egrep '(link.*rel|script).*http' ../juju-viz.html |egrep -o 'http[^"]+'| xargs -tr wget -c
	sha1sum *.js *.css > SHA1SUMS

ext-check:
	sha1sum -c SHA1SUMS

ext-edit:
	# pre: edit external resources to be "ext/filename"
	test    -f ../juju-viz.html.pre || sed -ri.pre 's!(https?://)([a-z0-9.-]+/)+(.*)!ext/\3!' ../juju-viz.html

ext-restore:
	# restore original main HTML
	test ! -f ../juju-viz.html.pre || mv ../juju-viz.html.pre ../juju-viz.html
