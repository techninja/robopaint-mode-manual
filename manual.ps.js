/**
 * @file Holds all RoboPaint manual/auto painting mode specific code
 */

// Initialize the RoboPaint canvas Paper.js extensions & layer management.
canvas.paperInit(paper);
rpRequire('paper_utils')(paper);
rpRequire('auto_stroke')(paper);
rpRequire('auto_fill')(paper);

// Init defaults & settings
paper.settings.handleSize = 10;

// Hold on to the selected path
paper.selectedPath = null;

// Reset Everything on non-mainLayer and vars
paper.resetAll = function() {
  // Stop all Fill and trace spooling (if running)
  paper.stroke.shutdown();
  paper.fill.shutdown();

  paper.canvas.mainLayer.opacity = 1;

  paper.canvas.tempLayer.removeChildren();
  paper.canvas.actionLayer.removeChildren();
}

// Animation frame callback
function onFrame(event) {
  canvas.onFrame(event);
  paper.stroke.onFrameStep();
  paper.fill.onFrameStep();
}

// Show preview paths
function onMouseMove(event)  {
  project.deselectAll();

  if (paper.selectedPath) {
    paper.selectedPath.fullySelected = true;
  }
  if (event.item && event.item.parent === paper.canvas.mainLayer) {
    event.item.selected = true;
  }
}

function onMouseDown(event)  {
  if (event.item && event.item.parent === paper.canvas.mainLayer) {
    project.deselectAll();
    paper.selectedPath = event.item;
    event.item.fullySelected = true;
    view.update(true);
  } else {
    project.deselectAll();
    paper.selectedPath = null;
  }

  // In Manual.js, manage what happens when a path is selected/deselected.
  pathSelected();
}

// Render a single stroke or fill path to the actionLayer
paper.renderPath = function (path, color, type, callback) {
  paper.canvas.mainLayer.opacity = 0.1;
  paper.canvas.tempLayer.opacity = 0.3;

  if (type === 'fill') {
    paper.fill.setup({path: path, pathColor: color}, callback);
  } else {
    paper.stroke.setup({path: path, pathColor: color}, callback);
  }
};

// Render the "action" layer, this is actually what will become the motion path
// sent to the bot.
paper.renderMotionPaths = function (callback) {
  paper.canvas.mainLayer.opacity = 0.1;
  paper.canvas.tempLayer.opacity = 0.3;

  paper.stroke.setup(function() {
    paper.fill.setup(function(){
      if (_.isFunction(callback)) callback();
    });
  });
};
