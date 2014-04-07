// vim: ts=4 et sw=4 si
var app = angular.module('vizApp',['ngRoute', 'uiSlider']);

app.run(function($rootScope, vizModel, $window) {
    var url = lib.getFile();
    vizModel.data.files.cur = url;
    var deltaValue = (function (delta) {
        var newval = (parseInt(vizModel.data.slider.cur)+delta);
        if (newval >= vizModel.data.slider.floor && newval <= vizModel.data.slider.ceiling) {
            vizModel.data.slider.cur = newval;
            vizModel.data.slider.version++;
            $rootScope.$digest();
            window.dispatchEvent(new Event('resize'));
        }
    });
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
});

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

app.controller("sliderCtrl", function($scope, vizModel, $window) {
    // initial value, later to be watch()ed
    // $scope.value = vizModel.data.slider;
    $scope.$watch(
        function () { return vizModel.data.slider; },
        function ( val ) {
            $scope.value = val;
            $scope.visible = (val.ceiling - val.floor) > 0;
            window.dispatchEvent(new Event('resize'));
        },
        true
    );
});
app.controller("fileSelCtrl", function($scope, $http, vizModel) {
    $scope.$watch(
        function () { return vizModel.data; },
        function ( data ) { $scope.data = data; },
        true
    );
    $scope.setFile = function() {
        lib.setFile(vizModel.data.files.cur);
    };
    $scope.fileFilter = function(file) {
        return /[.]dot+$/.test(file);
    };
    $scope.init = function(urlpath) {
        $http.get(urlpath).success(function(data) {
            links = angular.element(data).find("a");
            vizModel.data.files.list = [];
            for (var i=0; i< links.length; i++) {
                url = urlpath + '/' + links[i].getAttribute('href');
                url = url.replace('//', '/');
                vizModel.data.files.list.push(url);
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
            $scope.updateData(vizModel, data, timestamp);
            $scope.get_status = '[' + status + ' OK]';
        }).error(function(data, status, headers) {
            $scope.get_status = '[' + status + ' ERROR]';
        });
    });
    $scope.updateView = (function(idx) {
        data_cur = vizModel.data.dot.list[idx];
        if (! data_cur) return;
        // set via "dynamic" directive
        $scope.graph = vizModel.data.dot.list[idx].svg;
        $scope.timestamp = vizModel.data.dot.list[idx].timestamp;
    });
    $scope.updateData = (function(model, data, timestamp) {
        var idx = model.data.dot.list.length - 1;
        var cur_dot = (idx >=0) ? model.data.dot.list[idx] : null;
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
                model.data.dot.list.push({data: data, svg: svg_data(data, "svg"), timestamp: timestamp});
                model.data.slider.ceiling = idx + 1;
                model.data.slider.cur = idx + 1;
                model.data.slider.version++;
            } else if (data != cur_dot.data) {
                model.data.dot.list[idx] = {data: data, svg: svg_data(data, "svg"), timestamp: timestamp};
                model.data.slider.version++;
            } else {
                model.data.dot.list[idx].timestamp = timestamp;
                // TODO(jjo): this will need to be fixed for 'stick' slider cursor
                $scope.timestamp = timestamp;
            }
            return true;
        }
        return false;
    });
    $scope.repeatGetData = (function(file){
        $scope.getData(file);
        $timeout(function() { $scope.repeatGetData(file); }, refresh_delay());
    });
    $scope.$watch(
        function () { return vizModel.data.files.cur; },
        function ( file ) {
            if (file) {
                $scope.repeatGetData(file);
            }
        }
    );
    $scope.$watch(
        function () { return vizModel.data.slider.cur; },
        function ( cur ) {
            vizModel.data.slider.version++;
        }
    );
    $scope.$watch(
        function () { return vizModel.data.slider.version; },
        function ( version ) {
            $scope.updateView(vizModel.data.slider.cur);
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
    var dot_list_init = (debug() > 0) ? [{data: '[data]', svg: '[graph]', timestamp: '[timestamp]'}] : [];
    var dot_list_len = dot_list_init.length;
    this.data = {
        files:  { list: [],
                  cur: null},
        dot:    { list: dot_list_init,
                  cur: null },
        slider: { floor: 0,
                  ceiling: dot_list_len,
                  visible: dot_list_len,
                  cur: 0,
                  version: 0 },
    };
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
function refresh_delay() {
    return lib.getParameterByNameDef("refresh", 60 * 1000);
}


// debug an object by wrapping it inside <pre>
function inspect(s) {
    return "<pre>" + s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;") + "</pre>"
}
