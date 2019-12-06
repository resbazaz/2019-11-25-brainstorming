/* globals d3, jsyaml */

function toHierarchyInput (rootList) {
  return rootList.map(root => {
    if (typeof root === 'string') {
      return { 'id': root };
    } else {
      const key = Object.keys(root)[0];
      return {
        'id': key,
        'children': toHierarchyInput(root[key])
      };
    }
  });
}

window.onload = async () => {
  const [notes] = await Promise.all([
    d3.text('notes.yaml')
  ]);

  // Data wrangling
  const rawData = jsyaml.load(notes);
  const hierarchyInput = toHierarchyInput(rawData);
  const dagStructure = d3.dagHierarchy()(...hierarchyInput);

  // Do an initial rendering of the nodes, so we can compute the size of each
  // label
  const svg = d3.select('#mindmap');
  let nodes = svg.select('.nodeLayer')
    .selectAll('.node').data(dagStructure.descendants());
  nodes.exit().remove();
  const nodesEnter = nodes.enter().append('g')
    .classed('node', true);
  nodes = nodes.merge(nodesEnter);

  nodesEnter.append('text');
  nodes.select('text')
    .text(d => d.id)
    .each(function (d) {
      d.labelSize = this.getBoundingClientRect().width;
    });

  // DAG layout settings
  const maxLabelSize = d3.max(dagStructure.descendants().map(d => d.labelSize));
  dagStructure.descendants().forEach(d => { d.heightRatio = d.labelSize / maxLabelSize; });
  const layout = d3.arquint()
    .columnSeparation(d => 1)
    .interLayerSeparation(d => 0.2)
    // .size(d => { return [1, d.id.length / maxChars]; })
    .layering(d3.layeringSimplex());

  // Apply the layout
  layout(dagStructure);
  console.log(d3.max(dagStructure.descendants().map(d => d.x1)));

  // SVG setup, mappers from (vertical) DAG layout space to (horizonal) screen space
  const margins = { left: 100, top: 20, right: 300, bottom: 20 };
  const bounds = {
    width: 1600,
    height: 1600
  };
  svg
    .attr('width', bounds.width)
    .attr('height', bounds.height);
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(dagStructure.descendants().map(d => d.y1))])
    .range([margins.left, bounds.width - margins.right]);
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(dagStructure.descendants().map(d => d.x1))])
    .range([margins.top, bounds.width - margins.bottom]);
  const getCoords = node => {
    return {
      x: xScale(node.y),
      y: yScale(node.x)
    };
  };

  // Finish drawing the nodes
  nodesEnter.append('rect');
  nodes.select('rect')
    .each(function (d) {
      const c0 = getCoords({ x: d.x0, y: d.y0 });
      const c1 = getCoords({ x: d.x1, y: d.y1 });
      d3.select(this)
        .attr('width', c1.x - c0.x)
        .attr('height', c1.y - c0.y);
    });

  nodes.attr('transform', d => {
    const coords = getCoords({ x: d.x0, y: d.y0 });
    return `translate(${coords.x},${coords.y})`;
  });

  nodes.select('text')
    .attr('y', '1.5em')
    .attr('x', '0.5em');

  // Draw the links
  let links = svg.select('.linkLayer')
    .selectAll('.link').data(dagStructure.links());
  links.exit().remove();
  const linksEnter = links.enter().append('g')
    .classed('link', true);
  links = links.merge(linksEnter);

  const lineGenerator = d3.line()
    .curve(d3.curveCatmullRom.alpha(1))
    .x(d => d.x)
    .y(d => d.y);

  linksEnter.append('path');
  links.select('path')
    .attr('d', d => {
      return lineGenerator(d.data.points.map(getCoords));
    });
};
