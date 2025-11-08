// Real-time line chart using D3.js v4
function realTimeLineChart() {
  var margin = {top: 20, right: 20, bottom: 50, left: 50},
      width = 600,
      height = 300,
      duration = 500,
      color = d3.scaleOrdinal(d3.schemeCategory10);

  function chart(selection) {
    selection.each(function(data) {
      data = ["x"].map(function(c) {
        return {
          label: c,
          values: data.map(function(d) {
            return {time: +d.time, value: d[c], signal: d.signal};
          })
        };
      });

      var t = d3.transition().duration(duration).ease(d3.easeLinear);
      
      var minY = d3.min(data, function(c) { 
        return d3.min(c.values, function(v) { 
          return v.value; 
        });
      });
      
      var maxY = d3.max(data, function(c) { 
        return d3.max(c.values, function(v) { 
          return v.value; 
        });
      });

      var x = d3.scaleTime()
          .rangeRound([0, width - margin.left - margin.right]);

      var y = d3.scaleLinear()
          .domain([minY - 0.1, maxY + 0.1])
          .range([height - margin.top - margin.bottom, 0]);

      var line = d3.line()
          .curve(d3.curveBasis)
          .x(function(d) { return x(d.time); })
          .y(function(d) { return y(d.value); });

      var svg = d3.select(this).selectAll("svg").data([data]);
      var gEnter = svg.enter().append("svg").append("g");
      
      gEnter.append("g").attr("class", "axis x");
      gEnter.append("g").attr("class", "axis y");
      gEnter.append("defs").append("clipPath")
          .attr("id", "clip")
        .append("rect")
          .attr("width", width - margin.left - margin.right)
          .attr("height", height - margin.top - margin.bottom);
      gEnter.append("g")
          .attr("class", "lines")
          .attr("clip-path", "url(#clip)")
        .selectAll(".data").data(data).enter()
          .append("path")
            .attr("class", "data");

      // Add grid lines
      gEnter.append("g")
          .attr("class", "grid")
          .attr("clip-path", "url(#clip)");

      var svg = selection.select("svg");
      svg.attr('width', width).attr('height', height);
      var g = svg.select("g")
          .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      // Update domain
      var minTime = d3.min(data, function(c) { 
        return d3.min(c.values, function(v) { 
          return v.time; 
        });
      });
      
      var maxTime = d3.max(data, function(c) { 
        return d3.max(c.values, function(v) { 
          return v.time; 
        });
      });

      x.domain([minTime, maxTime]);

      // Update axes
      g.select(".axis.x")
          .attr("transform", "translate(0," + (height - margin.bottom - margin.top) + ")")
          .transition(t)
          .call(d3.axisBottom(x).ticks(5));

      g.select(".axis.y")
          .transition(t)
          .attr("class", "axis y")
          .call(d3.axisLeft(y));

      // Update grid
      var gridlines = d3.axisLeft(y)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat("");

      g.select(".grid")
          .transition(t)
          .call(gridlines)
          .selectAll("line")
          .attr("stroke", "#e0e0e0")
          .attr("stroke-opacity", 0.7);

      // Update lines
      var lines = g.select(".lines").selectAll(".data")
          .data(data);
      
      lines.enter()
          .append("path")
          .attr("class", "data");

      lines
          .style("stroke", function(d, i) { return color(i); })
          .style("stroke-width", 2)
          .style("fill", "none")
          .transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .on("start", tick);

      function tick() {
        d3.select(this)
            .attr("d", function(d) { return line(d.values); })
            .attr("transform", null);
      }

      lines.exit().remove();
    });
  }

  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin = _;
    return chart;
  };

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  return chart;
}
