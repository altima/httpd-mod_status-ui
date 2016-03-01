var serverStatusURL = document.location.hostname == '192.168.42.254' ? '/server-status?auto' : 'server-status.txt?auto'; // the txt file is used for development only.
var totalWorkers = 64; // Check MPM settings section of your httpd.conf or extra/httpd-mpm.conf
var refreshInterval = 500; // ms, how often to load data.
var timeWindow = 30; // s, length of the worker threads trend in seconds
var idleColor = "#3CB371"; // color of idle worker threads in charts
var busyColor = "#E74A3C"; // color of busy worker threads in charts
var scoreboardColors = [
    "#E74A3C",
    "#17BEBB",
    "#FFC914",
    "#3CB371",
    "#B0DB43",
    "#12EAEA",
    "#DB2763",
    "#F2FF49",
    "#3454D1",
    "#91A6FF"
];