juju-viz TODO
=============
- _E_ rework popover logic (commit 754e44b67658e635ebf7b47c64727aba7866eae4)
      to modify SVG object rather than SVG XML text
- _E_ hide angularJS markup on load, with something like e.g.:
      <div ng-show="vizModel.getFilesURLs().list.length" class="ng-hide">
      </div>
- _E_ add testing


DONE
----
- _R_ its giving 200 OK even if blocked by openid auth:
  "Assertion 7" from svg_data()
- _E_ better vizModel:
  - control graph, timestamp view independiently rather by
    overloading sliderCtrl "version"
- _R_: show #I/N also as slider status

Legends
-------
* _B_: bug
* _E_: enhancement
* _R_: regression
