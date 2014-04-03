// vim: ts=4 et sw=4 si
var app = angular.module('vizApp',['ngRoute', 'uiSlider']);

app.run(function($rootScope, dotListModel, $window) {
    var url = lib.getFile();
    dotListModel.data.selectedFile = url;
    var deltaValue = (function (delta) {
        var newval = (parseInt(dotListModel.slider_val.cur)+delta);
        if (newval >= dotListModel.slider_val.floor && newval <= dotListModel.slider_val.ceiling) {
            dotListModel.slider_val.cur = "" + newval;
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

app.controller("sliderCtrl", function($scope, $rootScope, dotListModel, $window) {
    // initial value, later to be watch()ed
    // $scope.value = dotListModel.slider_val;
    $scope.$watch(
        function () { return dotListModel.slider_val; },
        function ( val ) {
            $scope.value = val;
            $scope.visible = (val.ceiling - val.floor) > 0;
        },
        true
    );
});
app.controller("dotFileCtrl", function($scope, $http, dotListModel) {
    $scope.$watch(
        function () { return dotListModel.data; },
        function ( data ) { $scope.data = data; },
        true
    );
    $scope.setFile = function() {
        lib.setFile(dotListModel.data.selectedFile);
    };
    $scope.fileFilter = function(file) {
        return /[.]dot+$/.test(file);
    };
    $scope.init = function(urlpath) {
        $http.get(urlpath).success(function(data) {
            links = angular.element(data).find("a");
            dotListModel.data.files = [];
            for (var i=0; i< links.length; i++) {
                url = urlpath + links[i].pathname;
                url = url.replace('//', '/');
                dotListModel.data.files.push(url);
            }
        });
    }
    $scope.init("dot/");
});

app.controller("dotGraphCtrl", function($scope, $http, $timeout, dotListModel) {
    $scope.getData = (function(file) {
        $http.get(file, { cache: false }).success(function(data, status, headers) {
            $scope.filename = file;
            $scope.filename_png = file.replace(/\bdot\b/g, 'png');
            var timestamp = headers('Last-Modified');
            updateData(dotListModel, data, timestamp);
        });
    });
    $scope.last_idx = null;
    $scope.updateView = (function(idx) {
        if (isNaN(idx) || idx == $scope.last_idx) return;
        document.getElementById('graph').innerHTML = dotListModel.svg_hist[idx];
        $scope.timestamp = dotListModel.timestamp_hist[idx];
        $scope.last_idx = idx;
    });
    $scope.repeatGetData = (function(file){
        $scope.getData(file);
        $timeout(function() { $scope.repeatGetData(file); }, refresh_delay());
    });
    $scope.$watch(
        function () { return dotListModel.data.selectedFile; },
        function ( file ) {
            if (file) {
                $scope.repeatGetData(file);
            }
        }
    );
    $scope.$watch(
        function () { return dotListModel.slider_val.cur; },
        function ( cur ) {
            $scope.updateView(cur);
        }
    );
});
app.controller("jujuStatus", function($scope, $route, $http, $location, $anchorScroll) {
    $scope.setStatus = (function (title, content) {
        $scope.jujustatus_title = title;
        // set via innerHTML, to get it rendered as so:
        document.getElementById("jujustatus_text").innerHTML = content;
    });
    $scope.$on(
        "$routeChangeSuccess", function( $currentRoute, $previousRoute ){
            var url = lib.getFile();
            var hash = $location.path();
            $scope.setStatus(hash, hash? '{}' : '');
            $http.get(url + '.json').success(function(data) {
                $scope.updateStatus(data, hash);
                document.getElementById("jujustatus").scrollIntoView(true);
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
app.service("dotListModel", function(){
    this.data = {
        files: [],
        selectedFile: null,
    };
    this.slider_val = {
        floor: 0,
        ceiling: 1,
    };
    this.data_hist = new Array();
    this.svg_hist = new Array()
    this.timestamp_hist = new Array();
    this.data_hist[0] = "[data]";
    this.svg_hist[0] = "[graph here]";
    this.timestamp_hist[0] = "[no timestamp]";
    return this;
});
app.config(function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(false);
        $routeProvider
            .when('/:dotName*', {
            //.when('/', {
                controller: "dotGraphCtrl",
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
    return lib.getParameterByNameDef("debug", 2);
}
function refresh_delay() {
    return lib.getParameterByNameDef("refresh", 60 * 1000);
}

function updateData(model, data, timestamp) {
        var idx = model.svg_hist.length - 1;
        if (data != model.data_hist[idx]) {
            var svg=svg_data(data, "svg");
            var clean_old=null;
            var clean_new=null;
            // extract clean (non-detailed) data
            if (idx >= 0) {
                clean_old = model.data_hist[idx].replace(/tooltip=.*href=/mg,'href=');
                clean_new = data.replace(/tooltip=.*href=/mg,'href=');
            }
            // only push if the difference against latest is relevant
            // (ie compare "clean" data), else replace it.
            if ( (debug() > 1) || (idx < 0) || (clean_old != clean_new) ) {
                model.data_hist.push(data);
                model.svg_hist.push(svg);
                model.timestamp_hist.push(timestamp);
                model.slider_val.cur = idx + 1;
                model.slider_val.ceiling = idx + 1;
            } else {
                model.data_hist[idx] = data;
                model.svg_hist[idx] = svg;
                model.timestamp_hist[idx] = timestamp;
            }
            return true;
        }
        return false;
}

// debug an object by wrapping it inside <pre>
function inspect(s) {
    return "<pre>" + s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;") + "</pre>"
}
