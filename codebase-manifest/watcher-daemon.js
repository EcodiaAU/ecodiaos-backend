"use strict";

// Watcher daemon: writes pid file, spawns indexer in --watch mode,
// and self-restarts on crash. Designed to be launched once at Corazon logon
// via Windows Scheduled Task (see install-watcher.ps1) and survive forever.

const path = require("path");
const fs = require("fs");
const child = require("child_process");

const PID_PATH = path.join(__dirname, "watcher.pid");
const LOG_PATH = path.join(__dirname, "watcher.log");
const RESTART_BACKOFF_MS = 5000;

function log(msg) {
  const line = "[" + new Date().toISOString() + "] " + msg + "\n";
  fs.appendFileSync(LOG_PATH, line);
}

function writePid() {
  fs.writeFileSync(PID_PATH, String(process.pid));
}

function clearPid() {
  try { fs.unlinkSync(PID_PATH); } catch (_) {}
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function checkAlreadyRunning() {
  if (!fs.existsSync(PID_PATH)) return false;
  const existing = parseInt(fs.readFileSync(PID_PATH, "utf8").trim(), 10);
  if (existing && existing !== process.pid && isAlive(existing)) {
    log("watcher already running pid=" + existing + ", aborting");
    return true;
  }
  return false;
}

let currentChild = null;
let shouldStop = false;

function startIndexerWatch() {
  const indexer = path.join(__dirname, "indexer.js");
  log("spawning indexer --watch");
  currentChild = child.spawn(process.execPath, [indexer, "--watch"], {
    cwd: __dirname,
    detached: false,
    stdio: ["ignore", fs.openSync(LOG_PATH, "a"), fs.openSync(LOG_PATH, "a")],
  });

  currentChild.on("exit", function (code, signal) {
    log("indexer exited code=" + code + " signal=" + signal);
    currentChild = null;
    if (!shouldStop) {
      log("backoff " + RESTART_BACKOFF_MS + "ms then restart");
      setTimeout(startIndexerWatch, RESTART_BACKOFF_MS);
    }
  });
}

function shutdown(reason) {
  shouldStop = true;
  log("shutdown: " + reason);
  if (currentChild) {
    try { currentChild.kill(); } catch (_) {}
  }
  clearPid();
  process.exit(0);
}

if (checkAlreadyRunning()) process.exit(0);

writePid();
log("watcher daemon starting pid=" + process.pid);
startIndexerWatch();

process.on("SIGINT", function () { shutdown("SIGINT"); });
process.on("SIGTERM", function () { shutdown("SIGTERM"); });
process.on("exit", function () { clearPid(); });

// Heartbeat every 5 minutes so log shows the daemon alive
setInterval(function () {
  log("heartbeat: child=" + (currentChild ? "alive pid=" + currentChild.pid : "dead, awaiting respawn"));
}, 5 * 60 * 1000);