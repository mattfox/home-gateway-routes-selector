var fs = require('fs');
var process = require('child_process');
var express = require('express');
var bodyParser = require('body-parser');
var swig = require('swig');
var app = express();
app.enable('trust proxy'); // Because we're behind nginx.
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// Disable template caches
app.set('view cache', false);
swig.setDefaults({ cache: false });

var dnsmasqLeasesFile = '/var/lib/misc/dnsmasq.leases';
var routesRulesCmd = '/usr/local/share/routes/bin/routesrules';
var sudoCmd = '/usr/bin/sudo';

app.get('/', function(req, res) {
  // First, we read the leases file.
  readLeases(function(leases) {
    // Then we read the list of hosts being routed to the USA.
    process.execFile(
      sudoCmd,
      [routesRulesCmd, 'show', '--json'],
      function(error, stdout, stderr) {
        if (error !== null) {
          return console.log(error);
        }
        var usaHosts = JSON.parse(stdout);
        var hosts = [];
        for (var ip in leases) {
          hosts.push(
            {
              url: req.protocol + '://' + req.hostname + '/hosts/' + ip + '/',
              ip: ip,
              mac: leases[ip].mac,
              hostname: leases[ip].hostname,
              route: usaHosts.indexOf(ip) > -1 ? 'usa' : 'can',
            }
          );
        }
        res.render('index', { hosts: hosts });
      }
    );
  });
});

app.get('/me', function(req, res) {
  readLeases(function(leases) {
    if (leases.hasOwnProperty(req.ip)) {
      res.json(
        {
          ip: req.ip,
          mac: leases[req.ip].mac,
          hostname: leases[req.ip].hostname,
        }
      );
    } else {
      // IP isn't in leases.
      res.status(404).send('Not found');
    }
  });
});
app.get('/hosts', function(req, res) {
  // First, we read the leases file.
  readLeases(function(leases) {
    // Then we read the list of hosts being routed to the USA.
    process.execFile(
      sudoCmd,
      [routesRulesCmd, 'show', '--json'],
      function(error, stdout, stderr) {
        if (error !== null) {
          return console.log(error);
        }
        var usaHosts = JSON.parse(stdout);
        var hosts = [];
        for (var ip in leases) {
          hosts.push(
            {
              url: req.protocol + '://' + req.hostname + '/hosts/' + ip + '/',
              ip: ip,
              mac: leases[ip].mac,
              hostname: leases[ip].hostname,
              route: usaHosts.indexOf(ip) > -1 ? 'usa' : 'can',
            }
          );
        }
        res.json(hosts);
      }
    );
  });
});
app.get('/hosts/:ip', function(req, res) {
  // First, we read the leases file.
  readLeases(function(leases) {
    if (!leases.hasOwnProperty(req.params.ip)) {
      // IP isn't in leases.
      return res.status(404).send('Not found');
    }
    // Then we read the list of hosts being routed to the USA.
    process.execFile(
      sudoCmd,
      [routesRulesCmd, 'show', '--json'],
      function(error, stdout, stderr) {
        if (error !== null) {
          return console.log(error);
        }
        var usaHosts = JSON.parse(stdout);
        res.json(
          {
            url: req.protocol + '://' + req.hostname + '/hosts/' + req.params.ip + '/',
            ip: req.params.ip,
            mac: leases[req.params.ip].mac,
            hostname: leases[req.params.ip].hostname,
            route: usaHosts.indexOf(req.params.ip) > -1 ? 'usa' : 'can',
          }
        );
      }
    )
  });
});
app.post('/hosts/:ip', function(req, res) {
  // First, we read the leases file.
  readLeases(function(leases) {
    if (!leases.hasOwnProperty(req.params.ip)) {
      // IP isn't in leases.
      return res.status(404).send('Not found');
    }
    var routesRulesArg = req.body.route === 'usa' ? 'add' : 'remove';
    // Then we update the routing rules.
    process.execFile(
      sudoCmd,
      [routesRulesCmd, routesRulesArg, '--ip', req.params.ip],
      function(error, stdout, stderr) {
        if (error !== null) {
          return console.log(error);
        }
        if (req.accepts('html')) {
          return res.redirect('/');
        }
        res.json(
          {
            url: req.protocol + '://' + req.hostname + '/hosts/' + req.params.ip + '/',
            ip: req.params.ip,
            mac: leases[req.params.ip].mac,
            hostname: leases[req.params.ip].hostname,
            route: req.body.route === 'usa' ? 'usa' : 'can',
          }
        );
      }
    )
  });
});

function readLeases(cb) {
  // Run callback with object whose keys are string IP addresses.
  fs.readFile(dnsmasqLeasesFile, 'utf8', function (err, contents) {
    if (err) {
      return console.log(err);
    }
    rawLeases = contents.split('\n');
    var leasesByIP = {};
    var leaseSplit, ip, hostname, mac;
    for (var i=0; i < rawLeases.length; i++) {
      leaseSplit = rawLeases[i].split(' ');
      ip = leaseSplit[2];
      if (typeof ip !== 'undefined') {
        leasesByIP[ip] = {
          hostname: leaseSplit[3],
          mac: leaseSplit[4]
        }
      }
    }
    cb(leasesByIP);
  });
}

var server = app.listen(8000, '127.0.0.1', function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Routes app listening at http://%s:%s', host, port)

})
