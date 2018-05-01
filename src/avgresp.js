#!/usr/bin/env node
'use strict';

var prometheus = require('prom-client');

module.exports = {
    avgresp: avgresp
};


var history;
var samples;
var fullhistory = false;

/**
 * Create middleware to record and output average response times
 * @param  {Object} options
 * @return {function}
 */
function avgresp(options) {

    var opts = options || {};

    history = 50;
    samples = new Array(history);
    var currentIndex = 0;

    const respSummary = new prometheus.Summary({
        name: "tileserver_static_latency_seconds",
        help: "The tileserver response time in seconds"
    });

    return function avgresp(req, res, next) {
        var end = respSummary.startTimer();

        res.on('finish', function() {
            end();
        })

        next();
    }
}
