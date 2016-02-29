/*
 * This script loads data from output of httpd's mod_status and renders it in a slightly prettier way.
 * Main goal is to visualize the state and amount of worker threads
 *
 * The UI has following sections:
 * 1. General info - Uptime, Total threads, Total accesses, Total traffic, Data/sec avg, Requests/sec avg
 * 2. Ratio busy to idle worker threads
 * 3. Dynamics of idle threads for past X seconds (configurable in config.js as well as from UI)
 * 4. Scoreboard - what are the threads busy with
 * 5. Settings for refresh rate and section 3. trend length
 */
var maxDataPoints = 100;
var chartWorkers, chartWorkersTrend, chartScores;
var disconnectedStartTime = null;
$(function () {
    chartScores = createScoreBoard();
    chartWorkers = createWorkersChart();
    chartWorkersTrend = createWorkersTrendChart();
    createSettingsUI();
    loadData();
});

/**
 * Set up the settings UI: button actions and initial values
 */
function createSettingsUI() {
    var refreshText = $('#settingsRefreshText');
    var timeWindowText = $('#settingsTimeWindowText');
    refreshText.val(refreshInterval);
    timeWindowText.val(timeWindow);
    adjustRefreshRate(timeWindowText.val(), refreshText.val());

    $('#settingsButton').click(function () {
        $('#settings').toggle(200);
        $("html, body").animate({scrollTop: $(document).height()}, "fast");
    });

    $('#settingsApplyButton').click(function () {
        adjustRefreshRate(timeWindowText.val(), refreshText.val());
    });
}

/**
 * Create the ScoreBoard chart, displaying where the worker threads spend their time
 *
 * @returns {Ba.Chart} chart object
 */
function createScoreBoard() {
    return new CanvasJS.Chart("chart-scores",
        {
            data: [
                {
                    fillOpacity: .8,
                    type: "column",
                    dataPoints: [
                        {y: 0, label: "Waiting for connection"},
                        {y: 0, label: "Starting up"},
                        {y: 0, label: "Reading Request"},
                        {y: 0, label: "Sending Reply"},
                        {y: 0, label: "Keepalive (read)"},
                        {y: 0, label: "DNS Lookup"},
                        {y: 0, label: "Closing connection"},
                        {y: 0, label: "Logging"},
                        {y: 0, label: "Gracefully finishing"},
                        {y: 0, label: "Idle cleanup of worker"}
                    ]
                }
            ],
            animationEnabled: true,
            legend: {
                fontSize: 12
            },
            axisX: {
                labelAngle: 45,
                labelFontSize: 14
            },
            axisY: {
                maximum: totalWorkers,
                gridThickness: 1,
                gridColor: '#EEE'
            }
        });
}

/**
 * Create Workers chart showing current Busy to Idle thread ratio
 *
 * @returns {Ba.Chart} chart object
 */
function createWorkersChart() {
    return new CanvasJS.Chart("chart-workers", {
        animationEnabled: true,
        data: [
            {
                fillOpacity: .8,
                type: "stackedColumn",
                name: "Busy",
                color: busyColor,
                showInLegend: true,
                dataPoints: [
                    {label: "Threads", y: 0}
                ]
            },
            {
                fillOpacity: .8,
                type: "stackedColumn",
                name: "Idle",
                color: idleColor,
                showInLegend: true,
                dataPoints: [
                    {label: "Threads", y: 0}
                ]
            }
        ],
        legend: {
            fontSize: 12
        },
        axisY: {
            maximum: totalWorkers,
            gridThickness: 1,
            gridColor: '#EEE'
        },
        axisX: {
            labelFontSize: 14
        }
    });
}

/**
 * Create Workers Trend chart, showing idle thread amount dynamics
 *
 * @returns {Ba.Chart} chart object
 */
function createWorkersTrendChart() {
    return new CanvasJS.Chart("chart-workers-trend", {
        animationEnabled: true,
        data: [
            {
                type: "spline",
                name: "Idle threads",
                color: idleColor,
                showInLegend: true,
                dataPoints: []
            }
        ],
        legend: {
            fontSize: 12
        },
        axisY: {
            maximum: totalWorkers,
            gridThickness: 1,
            gridColor: '#EEE'
        },
        axisX: {
            labelFontSize: 14
        }
    });
}

/**
 * Load data from mod_status output, parse it, update the UI with values and schedule next data load
 */
function loadData() {
    $.get(serverStatusURL + '&r=' + Math.random(), function (status) {
            var data = parseData(status);
            updateGeneralData(data);
            updateWorkers(data);
            updateWorkersTrend(data);
            updateScoreboard(data.Scoreboard);
        }, 'text')
        .done(dataLoadSuccess)
        .fail(dataLoadFailure)
        .always(dataLoadFinished);
}

/**
 * In case data was loaded - hide the connection alert and reset alert time
 */
function dataLoadSuccess() {
    var noConnectionAlert = $("#NoConnectionAlert");
    if (noConnectionAlert.is(":visible"))
        noConnectionAlert.fadeOut("fast");
    disconnectedStartTime = null;
}

/**
 * In case data failed to load - show the connection alert and remember the time of failure
 */
function dataLoadFailure() {
    var noConnectionAlert = $("#NoConnectionAlert");
    if (!noConnectionAlert.is(":visible"))
        noConnectionAlert.fadeIn("fast");
    if (disconnectedStartTime == null)
        disconnectedStartTime = new Date();
}

/**
 * When data load request is done (regardless of result) - schedule next data load
 * And if currently there is no connection to status data url - update the time label value
 */
function dataLoadFinished() {
    setTimeout(loadData, refreshInterval);
    if (disconnectedStartTime != null)
        $("#NoConnectionTime").html("for " + secondsToHms((new Date() - disconnectedStartTime) / 1000));
}

/**
 * Parse the raw mod_status machine readable data (http://server/server-status?auto)
 * @param rawData raw multi-line string data
 * @returns {{TotalAccesses: number, TotalkBytes: number, BytesPerSec: number, ReqPerSec: number, Uptime: number, BusyWorkers: number, IdleWorkers: number, Scoreboard: string}}
 */
function parseData(rawData) {
    var parsedData = {
        TotalAccesses: 0,
        TotalkBytes: 0,
        BytesPerSec: 0,
        ReqPerSec: 0,
        Uptime: 0,
        BusyWorkers: 0,
        IdleWorkers: 0,
        Scoreboard: ""
    };
    var lines = rawData.split("\n");
    try {
        for (var i in lines) {
            parseLine(lines[i], parsedData);
        }
    } catch (e) {
        log('Failed to parse data', e);
    }
    return parsedData;
}

/**
 * Parse single line of raw data into pre-created data object
 * @param line raw string line
 * @param data object, whose property to populate
 */
function parseLine(line, data) {
    try {
        line = line.match(/([^:]+):\s*(.+)/);
        if (line != null) {
            var key = line[1].replace(/\s/g, '');
            data[key] = line[2];
        }
    } catch (e) {
        log('Failed to parse line ' + line, e);
    }
}

/**
 * Update Workers Trend chart. Add new values and remove old ones if necessary
 * to keep the desired length, aka "time window"
 *
 * @param data status data
 */
function updateWorkersTrend(data) {
    try {
        chartWorkersTrend.options.data[0].dataPoints.push({x: new Date(), y: parseInt(data.IdleWorkers)});

        if (chartWorkersTrend.options.data[0].dataPoints.length > maxDataPoints)
            chartWorkersTrend.options.data[0].dataPoints.shift();

        chartWorkersTrend.render();
    } catch (e) {
        log('Failed to update workers trend', e);
    }
}

/**
 * Update Workers chart with BusyWorkers and IdleWorkers numbers
 *
 * @param data status data
 */
function updateWorkers(data) {
    try {
        chartWorkers.options.data[0].dataPoints[0].y = parseInt(data.BusyWorkers);
        chartWorkers.options.data[1].dataPoints[0].y = parseInt(data.IdleWorkers);
        chartWorkers.render();
    } catch (e) {
        log('Failed to update workers', e);
    }
}

/**
 * Update general data (Uptime, etc.)
 *
 * @param data status data
 */
function updateGeneralData(data) {
    try {
        $('#TotalAccesses').html((parseInt(data.TotalAccesses) / 1000).toFixed(0) + 'M');
        $('#TotalkBytes').html(formatSizeUnits(parseInt(data.TotalkBytes) * 1024));
        $('#BytesPerSec').html(formatSizeUnits(parseInt(data.BytesPerSec)));
        $('#ReqPerSec').html(parseInt(data.ReqPerSec));
        $('#Uptime').html(secondsToHms(parseInt(data.Uptime)));
        $('#TotalThreads').html(totalWorkers);
    } catch (e) {
        log('Failed to update general data', e);
    }
}

/**
 * Update Scoreboard chart
 *
 * @param data status data
 */
function updateScoreboard(data) {
    try {
        chartScores.options.data[0].dataPoints[0].y = data.replace(/[^_]/g, '').length;
        chartScores.options.data[0].dataPoints[1].y = data.replace(/[^S]/g, '').length;
        chartScores.options.data[0].dataPoints[2].y = data.replace(/[^R]/g, '').length;
        chartScores.options.data[0].dataPoints[3].y = data.replace(/[^W]/g, '').length;
        chartScores.options.data[0].dataPoints[4].y = data.replace(/[^K]/g, '').length;
        chartScores.options.data[0].dataPoints[5].y = data.replace(/[^D]/g, '').length;
        chartScores.options.data[0].dataPoints[6].y = data.replace(/[^C]/g, '').length;
        chartScores.options.data[0].dataPoints[7].y = data.replace(/[^L]/g, '').length;
        chartScores.options.data[0].dataPoints[8].y = data.replace(/[^G]/g, '').length;
        chartScores.options.data[0].dataPoints[9].y = data.replace(/[^I]/g, '').length;
        chartScores.render();
    } catch (e) {
        log('Failed to update scoreboard', e);
    }
}

/**
 * Dynamically format data size depending on value
 *
 * @param bytes
 * @returns formatted data size string
 */
function formatSizeUnits(bytes) {
    if (bytes >= 1073741824)
        bytes = (bytes / 1073741824).toFixed(2) + ' GiB';
    else if (bytes >= 1048576)
        bytes = (bytes / 1048576).toFixed(2) + ' MiB';
    else if (bytes >= 1024)
        bytes = (bytes / 1024).toFixed(2) + ' KiB';
    return bytes;
}

/**
 * Build a time string from time value specified in seconds
 *
 * @param secondsTotal
 * @returns string formatted string
 */
function secondsToHms(secondsTotal) {
    var h = Math.floor(secondsTotal / 3600);
    var m = Math.floor(secondsTotal % 3600 / 60);
    var s = Math.floor(secondsTotal % 3600 % 60);
    return ((h > 0 ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s);
}

/**
 * Apply the settings adjusted by user
 *
 * @param timeWindow length of Workers Trend chart in seconds
 * @param interval data load refresh interval
 */
function adjustRefreshRate(timeWindow, interval) {
    try {
        var refreshWindow = parseInt(timeWindow);
        refreshInterval = parseInt(interval);
        maxDataPoints = Math.max(5, refreshWindow * 1000 / refreshInterval);
        while (chartWorkersTrend.options.data[0].dataPoints.length >= maxDataPoints)
            chartWorkersTrend.options.data[0].dataPoints.shift();
    } catch (e) {
        log('Error adjusting refresh rate', e);
    }
}

/**
 * Log error message
 * @param message free text message
 * @param e error message
 */
function log(message, e) {
    console.log(message);
    console.log(e);
}