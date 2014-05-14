// vim: ts=4 et sw=4 si
var app = angular.module('vizApp',['ngRoute', 'uiSlider']);

app.run(function($rootScope, vizModel, $window) {
    // Helper function to allow moving the slider from here (vs UI)
    var deltaValue = (function (delta) {
        var newval = (parseInt(vizModel.getSlider().cur)+delta);
        if (newval >= vizModel.getSlider().floor && newval <= vizModel.getSlider().ceiling) {
            vizModel.getSlider().cur = newval;
            vizModel.getSlider().version++;
            $rootScope.$digest();
            // this angularjs slider doesn't react automatically, fire a 'resize'
            window.dispatchEvent(new Event('resize'));
        }
    });
    // Bind Cursor-left/right to slider moves
    angular.element($window).on('keydown', function(e) {
        switch(e.keyIdentifier) {
            case "Left":
                deltaValue(-1);
                break;
            case "Right":
                deltaValue(1);
                break;
        }
    });
    vizModel.setFileUrl(lib.getFile());
});

// Create 'dynamic' directive to allow changing elements' HTML/SVG/etc
// and get them rendered (ala innerHTML='...')
app.directive('dynamic', function ($compile) {
  return {
    restrict: 'A',
    replace: true,
    link: function (scope, ele, attrs) {
      scope.$watch(attrs.dynamic, function(html) {
        ele.html(html);
        $compile(ele.contents())(scope);
      });
    }
  };
});

app.controller("stateCtrl", function($scope, vizModel) {
    $scope.title = ""
    $scope.n = "";
    $scope.$watch(
        function () { return vizModel.getFileUrl(); },
        function ( file ) {
            if (file) {
                $scope.title = file.replace(/.*[/]/, "");
            }
        }
    );
    $scope.$watch(
        function () { return vizModel.getSlider().ceiling; },
        function ( ceiling ) {
            if (ceiling)
                $scope.n = "(" + ceiling + ") ";
            else
                $scope.n = "";
        }
    );
});
app.controller("sliderCtrl", function($scope, vizModel, $window) {
    // initial value, later to be watch()ed
    $scope.$watch(
        function () { return vizModel.getSlider(); },
        function ( slider ) {
            $scope.slider = slider;
            $scope.visible = (slider.ceiling - slider.floor) > 0;
            window.dispatchEvent(new Event('resize'));
        },
        true
    );
});
app.controller("fileSelCtrl", function($scope, $http, vizModel) {
    $scope.$watch(
        function () { return vizModel.getFiles(); },
        function ( files ) { $scope.files = files; },
        true
    );
    $scope.setFile = function() {
        lib.setFile(vizModel.getFileUrl());
    };
    $scope.fileFilter = function(file) {
        return /[.]dot+$/.test(file);
    };
    $scope.init = function(urlpath) {
        $http.get(urlpath).success(function(data) {
            links = angular.element(data).find("a");
            for (var i=0; i< links.length; i++) {
                url = urlpath + '/' + links[i].getAttribute('href');
                url = url.replace('//', '/');
                vizModel.addFileUrl(url);
            }
        });
    }
    $scope.init(window.location.pathname.replace(/[^/]+$/,'') + 'dot/');
});

app.controller("vizGraphCtrl", function($scope, $http, $timeout, vizModel) {
    $scope.get_status = '';
    $scope.getData = (function(file) {
        $scope.get_status = '[loading...]';
        $http.get(lib.noCache(file)).success(function(data, status, headers) {
            $scope.filename = file;
            $scope.filename_png = file.replace(/\bdot\b/g, 'png');
            var timestamp = headers('Last-Modified');
            $scope.updateData(data, timestamp);
            $scope.get_status = '[' + status + ' OK]';
        }).error(function(data, status, headers) {
            err_str = (status == 0)? "" : status + " ERROR";
            $scope.get_status = '[' + err_str + ']';
        });
    });
    $scope.updateView = (function(idx) {
        dot_view = vizModel.getDot(idx);
        if (!dot_view) return;
        // set via "dynamic" directive
        $scope.graph = dot_view.svg;
        $scope.timestamp = dot_view.timestamp;
    });
    $scope.updateData = (function(data, timestamp) {
        var cur_dot = vizModel.getDot()
        if (!cur_dot || data != cur_dot.data || timestamp != cur_dot.timestamp ) {
            var svg=null;
            var clean_old=null;
            var clean_new=null;
            // extract clean (non-detailed) data
            if (cur_dot) {
                clean_old = cur_dot.data.replace(/tooltip=.*href=/mg,'href=');
                clean_new = data.replace(/tooltip=.*href=/mg,'href=');
            }
            // only push if the difference against latest is relevant
            // (ie compare "clean" data), else replace it.
            if ( (debug() > 1) || !cur_dot || (clean_old != clean_new) ) {
                vizModel.addDot({data: data, svg: svg_data(data, "svg"), timestamp: timestamp});
            } else if (data != cur_dot.data) {
                vizModel.modDot({data: data, svg: svg_data(data, "svg"), timestamp: timestamp});
            } else {
                cur_dot.timestamp = timestamp;
                // TODO(jjo): this will need to be fixed for 'stick' slider cursor
                $scope.timestamp = timestamp;
            }
            return true;
        }
        return false;
    });
    $scope.repeatGetData = (function(file){
        $scope.getData(file);
        $timeout(function() { $scope.repeatGetData(file); }, refresh_delay_ms());
    });
    $scope.$watch(
        function () { return vizModel.getFileUrl(); },
        function ( file ) {
            if (file) {
                $scope.repeatGetData(file);
            }
        }
    );
    $scope.$watch(
        function () { return vizModel.getSlider().cur; },
        function ( cur ) {
            vizModel.getSlider().version++;
        }
    );
    $scope.$watch(
        function () { return vizModel.getSlider().version; },
        function ( version ) {
            $scope.updateView(vizModel.getSlider().cur);
        }
    );
});
app.controller("statusCtrl", function($scope, $route, $http, $location, $anchorScroll, $timeout) {
    $scope.setStatus = (function (title, content) {
        $scope.jujustatus_title = title;
        // set via "dynamic" directive
        $scope.jujustatus_text = content;
        var e = document.querySelectorAll('[dynamic=jujustatus_text]')
        if (e && $scope.jujustatus_text)
            e[0].scrollIntoView(true);
    });
    $scope.$on(
        "$routeChangeSuccess", function( $currentRoute, $previousRoute ){
            var url = lib.getFile();
            var hash = $location.path();
            $scope.setStatus(hash, hash? '{}' : '');
            $http.get(lib.noCache(url + '.json')).success(function(data) {
                $scope.updateStatus(data, hash);
            });
    });
    $scope.updateStatus = (function(obj, hash) {
        var match = hash.match("^/(.*)=(.*)");
        var services = obj.services;
        var status_text = "";
        if (!match || match.length < 2) {
            $scope.setStatus("", "");
            return;
        }
        sel_name = match[1];
        sel_key = match[2];
        switch(match[1]) {
            case "service":
                if (sel_key == "__all__") {
                    status_text = services;
                } else {
                    status_text = services[sel_key];
                }
                break;
            case "unit":
                // find get the servicename from servicename/<number>
                var namenum = sel_key.match("(.*)/([0-9]+)");
                var servicename = namenum[1];
                var unitnum = namenum[2];
                status_text = services[servicename]["units"][sel_key];
                break;
        }
        if (!status_text)
            return false;
        $scope.setStatus(hash, lib.jujuHilight(status_text, obj));
    });
});
app.service("vizModel", function(){
    this.data = {
        files:  { list: [],
                  cur: null},
        dot:    { list: [],
                  cur_idx: -1 },
        slider: { floor: 0,
                  ceiling: 0,
                  visible: 0,
                  cur: 0,
                  version: 0 },
    };
    this.addDot = (function(new_dot) {
        this.data.dot.list.push(new_dot);
        this.data.dot.cur_idx++;
        this.data.slider.ceiling = this.data.dot.cur_idx;
        this.data.slider.cur = this.data.dot.cur_idx;
        this.data.slider.version++;
    });
    this.modDot = (function(new_dot) {
        if (this.data.dot.cur_idx >= 0) {
            this.data.dot.list[this.data.dot.cur_idx] = new_dot;
            this.data.slider.version++;
        }
    });
    this.getDot = (function(idx) {
        idx = (typeof idx === "undefined") ? this.data.dot.cur_idx : idx;
        if (idx >= 0)
            return this.data.dot.list[idx];
        else
            return null
    });
    this.setDotIdx = (function(new_idr) {
        this.cur_idx = new_idx;
    });
    this.addFileUrl = (function(url) {
        this.data.files.list.push(url);
    });
    this.getFiles = (function() {
        return this.data.files;
    });
    this.setFileUrl = (function(url) {
        this.data.files.cur = url;
    });
    this.getFileUrl = (function() {
        return this.data.files.cur;
    });
    this.getSlider = (function() {
        return this.data.slider;
    });
    if (debug() > 0)
        this.addDot({data: '[data]', svg: '[graph]', timestamp: '[timestamp]'});
    return this;
});
app.config(function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(false);
        $routeProvider
            .when('/:dotName*', {
            //.when('/', {
                controller: "vizGraphCtrl",
                reloadOnSearch: false})
});

// convert DOT text to SVG
function svg_data(data, format) {
    var result;
    try {
        result = Viz(data, format);
        if (format === "svg")
            return result;
        else
            return inspect(result);
        } catch(e) {
            return inspect(e.toString());
    }
}
// new DOT data loaded via AJAX
// add debug=N to enable debug code
function debug() {
    return lib.getParameterByNameDef("debug", 0);
}
function refresh_delay_ms() {
    return 1000 * lib.getParameterByNameDef("refresh", 300);
}


// debug an object by wrapping it inside <pre>
function inspect(s) {
    return "<pre>" + s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;") + "</pre>"
}
