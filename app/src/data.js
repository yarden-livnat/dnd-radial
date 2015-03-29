/**
 * Created by yarden on 2/6/15.
 */
define(function(require) {

  var model = require('model');
  var d3 = require('d3');
  var queue = require('d3_queue');
  var Radio = require('radio');

  var runsInfo;
  var runs = d3.map();
  var colors = d3.scale.category10();
    //d3.scale.ordinal()
    //  .domain([0,10])
    //  .range(colorbrewer.Spectral[6]);

  function createRun(name) {
    var run = {
      groups: [],
      routers: new Map(),
      nodes: new Map(),
      counters: [],
      blues: new Map(),
      greens: new Map(),
      blacks: new Map(),
      links: new Map(),
      jobs: d3.map(),
      job_colors: new Map(),
      core_to_node: d3.map()
      };

    var g, r, c, node, rid = 0, cid = 0;

    for(g = 0; g < model.N_GROUPS; g++) {
      var group = {id: g, routers: [], mode: 'full'};
      run.groups.push(group);
      for(r = 0; r < model.N_ROWS; r++) {
        var row = [];
        group.routers.push(row);
        for(c = 0; c < model.N_COLS; c++) {
          var router = {
            id: model.router_id(g, r, c),
            g: g,  r:r,  c:c,
            jobs:[undefined, undefined, undefined, undefined]
          };
          row.push(router);
          run.routers.set(router.id, router);
        }
      }
    }
    return run;
  }

  function loadRun(name) {
    var info = runsInfo.get(name);
    queue()
      .defer(d3.csv, info.jobs)
      .defer(d3.text, info.counters)
      .await(function (error, placement, counters) {
        if (error) {
          console.log("Error loading data", error);
        }
        else {
          var run = createRun(name);
          run.commFile = info.comm;
          //runs.set(name, run);
          loadPlacement(placement, run);
          loadCounters(counters, run);
          Backbone.Radio.channel('data').trigger('run', run);
        }
      });
  }

  function loadPlacement(data, run) {
    var job;
    var i=-1, rank;
    data.forEach(function (item) {
      i++;
      if (!item.core || item.core == 0) {
        rank = Math.round(i/24);
        if (i%24 > 0) {
          console.log('rank issue:', i, rank);}
        item.rank = rank;
        item.g = +item.g;
        item.r = +item.r;
        item.c = +item.c;
        item.n = +item.n;

        item.id = model.node_id(item);
        item.jobid = +item.jobid;
        //console.log('rank:',rank,  item);
        run.nodes.set(item.rank, item);
        run.routers.get(model.router_id(item)).jobs[item.n] = item.jobid;
        job = run.jobs.get(item.jobid);
        if (!job) {
          job = {id: item.jobid, n:0};
          run.jobs.set(item.jobid, job);
        }
        job.n++;
      }
    });

    console.log('placement: rank=',rank);
    var jobs = run.jobs.values();
    jobs.sort(function(a, b) {
      return b.n - a.n;
    });

    var i=0;
    jobs.forEach(function(job) {
      job.color = colors(i);
      run.job_colors.set(job.id, job.color);
      if (i < 9) i++;
    });
  }

  function loadCounters(data, run) {
    var i, n, values, sg, sr, sc, dg, dr, dc, color, j, nc, id, link;

    var rows = d3.csv.parseRows(data);
    run.countersNames = rows[0].slice(7);
    run.counters = [];
    n = rows.length;
    for (i = 1; i < n; i++) {
      values = rows[i];
      sg = +values.shift();
      sr = +values.shift();
      sc = +values.shift();
      dg = +values.shift();
      dr = +values.shift();
      dc = +values.shift();
      color = values.shift();
      nc = values.length;
      for (j = 0; j < nc; j++) {
        values[j] = +values[j];
      }
      id = model.link_id(sg, sr, sc, dg, dr, dc);
      if (id =='0:0:0-0:0:1') {
        console.log('first link');
      }
      link = {
        id: id,
        color: color,
        srcId: {g: sg, r: sr, c: sc},
        destId: {g: dg, r: dr, c: dc},
        src: run.routers.get(model.router_id(sg, sr, sc)),
        dest: run.routers.get(model.router_id(dg, dr, dc)),
        counters: values
      };
      if (color == 'b') run.blues.set(link.id, link);
      else if (color == 'g') run.greens.set(link.id, link);
      else run.blacks.set(link.id, link);

      run.links.set(link.id, link);
    }
  }

  var service = {};

  service.start = function () {
    d3.csv('data/runs.csv', function(list) {
      list.sort(function(a,b) {
        if (a.name < b.name) return -1;
        else if (a.name > b.name) return 1;
        return 0;
      });
      list.forEach(function(item) {
        item.counters = '/data/'+item.counters;
        item.jobs = '/data/'+item.jobs;
        item.comm = '/data/'+item.comm;
      });
      runsInfo = d3.map(list,  function(d) { return d.name;});
      Backbone.Radio.channel('data').trigger('runsList', list);
    });
    return this;
  };

  service.load = function (name) {
    var run = runs.get(name);
    if (!run) {
      loadRun(name);
    } else {
      Backbone.Radio.channel('data').trigger('run', run);
    }
    return this;
  };

  return service;
});