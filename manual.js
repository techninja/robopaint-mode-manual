/**
 * @file Holds all RoboPaint manual painting mode specific code
 */
"use strict";

var actualPen = {}; // Hold onto the latest actualPen object from updates.
var buffer = {};
var canvas = rpRequire('canvas');
var cTool = null;
var t = i18n.t;

mode.pageInitReady = function () {
  // Initialize the paper.js canvas with wrapper margin and other settings.
  canvas.domInit({
    replace: '#paper-placeholder', // jQuery selecter of element to replace
    paperScriptFile: 'manual.ps.js', // The main PaperScript file to load
    wrapperMargin: {
      top: 30,
      left: 30,
      right: 265,
      bottom: 40
    },

    // Called when PaperScript init is complete, requires
    // canvas.paperInit(paper) to be called in this modes paperscript file.
    // Don't forget that!
    loadedCallback: paperLoadedInit
  });

  // Initial run to render existing colorsets.
  buildColorSet();

  // Bind window resize for non-canvas elements
  $(window).on('resize', responsiveResize).resize();
}

// Called whenever the action layer might change, will enable/disable the start
// button.
function checkActionLayer() {
  $('#pause').prop('disabled', !paper.canvas.actionLayer.children.length);
}

// Catch CNCServer buffered callbacks
mode.onCallbackEvent = function(name) {
  switch (name) {
    case 'autoPaintBegin': // Should happen when we've just started
      $('#pause').prop('disabled', false); // Enable pause button
      break;
    case 'autoPaintComplete': // Should happen when we're completely done
      $('#pause').attr('class', 'ready')
        .attr('title', t('modes.manual.commands.start'))
        .text(robopaint.t('common.action.start'))
        .prop('disabled', false);
      pathSelected();
      checkActionLayer();
      $('.idleonly').prop('disabled', false);
      $('#cancel').prop('disabled', true); // Disable the cancel print button
      break;
  }
};

// Trigger load init resize only after paper has called this function.
function paperLoadedInit() {
  if (!robopaint.svg.isEmpty()) {
    paper.canvas.loadSVG(robopaint.svg.load());

    // No groups! Easier to select things.
    paper.utils.ungroupAllGroups(paper.canvas.mainLayer);
  }

  // With Paper ready, send a single up to fill values for buffer & pen.
  mode.run('up');
}

// Catch less general message types from RoboPaint.
mode.onMessage = function(channel, data) {
  switch (channel) {
    // SVG has been pushed into localStorage, and main suggests you load it.
    case 'loadSVG':
      paper.resetAll();
      mode.run('status', ''); // TODO: Can we do better for the user here?
      paper.canvas.loadSVG(robopaint.svg.load());
      break;
    case 'updateMediaSet':
      buildColorSet();
      break;
    case 'updatePenMode':
      $(window).resize();
      break;
  }
};

/**
 * Update the rendering of the colorset
 */
function buildColorSet() {
  var set = robopaint.media.currentSet;
  robopaint.media.addStylesheet();
  $('#colors').attr('class', '').addClass(set.baseClass);
}


// Triggered when the canvas is clicked, check for paper.selectedPath changes.
function pathSelected() {
  if (paper.selectedPath) {
    $('#draw, #fill').prop('disabled', false);
  } else {
    $('#draw, #fill').prop('disabled', true);
  }
}


// Mode API called callback for binding the controls
mode.bindControls = function() {
  // Cancel Print
  $('#cancel').click(function(){
    var cancelPrint = confirm(mode.t("status.confirm"));
    if (cancelPrint) {
      mode.onCallbackEvent('autoPaintComplete');
      mode.fullCancel(mode.t('status.cancelled'));
    }
  });

  // Bind start/pause click and functionality
  $('#pause').click(function() {

    // With nothing in the queue, start painting the preview (will be disabled
    // until there is something to paint)
    if (buffer.length === 0) {
      $('#pause')
        .removeClass('ready')
        .attr('title', t("modes.print.status.pause"))
        .text(t('common.action.pause'))
        .prop('disabled', true);
      $('#auto-paint, #fill, #draw').prop('disabled', true); // Disable options
      $('.idleonly').prop('disabled', true);
      $('#cancel').prop('disabled', false); // Enable the cancel print button

      paper.utils.autoPaint(paper.canvas.actionLayer);
    } else {
      // With something in the queue... we're either pausing, or resuming
      if (!buffer.paused) {
        // Starting Pause =========
        $('#pause').prop('disabled', true).attr('title', t("status.wait"));
        mode.run([
          ['status', t("status.pausing")],
          ['pause']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyPaused = function(){
          mode.run('status', t("status.paused"));
          $('.idleonly').prop('disabled', false);
          $('#pause')
            .addClass('active')
            .attr('title', t("status.resume"))
            .prop('disabled', false)
            .text(t("common.action.resume"));
        };
      } else {
        // Resuming ===============
        $('#buttons button.normal').prop('disabled', true); // Disable options
        mode.run([
          ['status', t("status.resuming")],
          ['resume']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyResumed = function(){
          $('#pause')
            .removeClass('active')
            .attr('title', t("mode.print.status.pause"))
            .text(t('common.action.pause'));
          $('.idleonly').prop('disabled', true);
          mode.run('status', t("status.resumed"));
        };
      }
    }
  });

  $('#reset').click(function(){
    paper.resetAll();
    checkActionLayer();
  });

  // Setup settings group tabs
  $('ul.tabs').each(function(){
    var $links = $(this).find('a');

    var $active = $($links[0]);
    $active.addClass('active');
    var $content = $($active.attr('href'));

    // Hide the remaining content
    $links.not($active).each(function () {
      $($(this).attr('href')).hide();
    });

    // Bind the click event handler for tabs
    $(this).on('click', 'a', function(e){
      // Make the old tab inactive.
      $active.removeClass('active');
      $content.hide();

      // Update the variables with the new link and content
      $active = $(this);
      $content = $($(this).attr('href'));

      // Make the tab active.
      $active.addClass('active');
      $content.show();

      // Prevent the anchor's default click action
      e.preventDefault();
    });
  });


  // Bind to control buttons
  $('#park').click(function(){
    // If we're paused, skip the buffer
    mode.run([
      ['status', mode.t("status.parking"), buffer.paused],
      ['park', buffer.paused], // TODO: If paused, only one message will show :/
      ['status', mode.t("status.parked"), buffer.paused]
    ]);
  });

  // Bind stroke selected object button
  $('#draw').click(function(){
    $('#draw, #fill').prop('disabled', true);
    paper.renderPath(paper.selectedPath, cTool, 'stroke', function(){
      checkActionLayer();
      $('#draw, #fill').prop('disabled', false);
    });
  });

  // Bind to fill controls
  $('#fill').click(function(){
    $('#draw, #fill').prop('disabled', true);
    paper.renderPath(paper.selectedPath, cTool, 'fill', function(){
      checkActionLayer();
      $('#draw, #fill').prop('disabled', false);
    });
  });

  // Bind various buttons
  $('#pen').click(function(){
    // Run height pos into the buffer, or skip buffer if paused
    var newState = 'up';
    if (actualPen.state === "up" || actualPen.state === 0) {
      newState = 'down';
    }

    mode.run(newState, buffer.paused);
  });

  $('#calibrate').click(function(){
    // Move to calibrate position via buffer, or skip if paused
    mode.run('move', {x: 0, y:0});
  });

  // Motor unlock: Also lifts pen and zeros out.
  $('#disable').click(function(){
    mode.run([
      ['status', mode.t("status.unlocking")],
      ['up'],
      ['zero'],
      ['unlock'],
      ['status', mode.t("status.unlocked")]
    ]);
  });

  $('#zero').click(function(){
    mode.run([
      ['status', mode.t("status.zero")],
      ['zero']
    ]);
  });

  $('#auto-paint').click(function(){
    $('#auto-paint, #fill, #draw').prop('disabled', true);

    // Render stroke and fill to the actionLayer
    paper.renderMotionPaths(function(){
      // When done, lets autoPaint em!
      paper.utils.autoPaint(paper.canvas.actionLayer);
    });
  });

  // Bind to Recording Buttons
  $('fieldset.recording button').click(function(e){
    // TODO: Rewrite this
    /*
    if (this.id == 'record-toggle') {
      cncserver.state.isRecording = !cncserver.state.isRecording;
      if (cncserver.state.isRecording) {
        $(this).text(mode.t('commands.buffer.stop'));
      } else {
        $(this).text(mode.t('commands.buffer.record'));
        if (cncserver.state.recordBuffer.length) {
          $('#record-play, #record-clear').prop('disabled', false);
        }
      }
    } else if (this.id == 'record-play') {
      $.merge(cncserver.state.buffer, cncserver.state.recordBuffer);
    } else if (this.id == 'record-clear') {
      cncserver.state.recordBuffer = [];
      $('#record-play, #record-clear').prop('disabled', true);
    }*/
  });

  // Add extra dom to allow for specific sub-selection of dip/full paint & water
  $('nav#tools a').each(function(){
    var $t = $(this);

    $('<a>')
      .text(mode.t('labels.full'))
      .attr('title', mode.t('commands.full'))
      .attr('data-i18n', '[title]modes.manual.commands.full;modes.manual.labels.full')
      .addClass('sub-option full')
      .appendTo($t);
    $('<a>')
      .text(mode.t('labels.dip'))
      .attr('title', mode.t('commands.dip'))
      .attr('data-i18n', '[title]modes.manual.commands.dip;modes.manual.labels.dip')
      .addClass('sub-option dip')
      .appendTo($t);
  });

  // Bind to Tool Change nav items
  $('nav#tools a a').click(function(e){
    var $p = $(this).parent();
    var isDip = $(this).is('.dip'); // Full or dip?
    var toolExt = isDip ? 'dip' : '';

    if ($p.is('.color, .water')) {
      cTool = $p.attr('id') + toolExt;
      mode.run('media', $p.attr('id') + toolExt);
    }

    // X clicked: Do a full brush wash
    if ($p.is('#colorx')) {
      cTool = null;
      mode.run([
        'wash',
        'park'
      ]);
    }

    return false;
  });
}

function responsiveResize(){
  var w = $('#paper-back').width();
  var h = $('#paper-back').height();

  var mode = robopaint.settings.penmode;
  var toolRightMargin = 15;

  // Hide Water
  $('#waters').toggleClass('disabled', mode == 3 || mode == 2);

  // Hide Paint
  $('#colors').toggleClass('disabled', mode == 3 || mode == 1);

  var $tools = $('#tools');
  var matchHeight = robopaint.canvas.height * canvas.settings.scale;
  var toolScale = matchHeight / $tools.height();

  $tools.toggleClass('transition', false);
  // Scale tools to height match full size canvas
  $tools.css({
    transform: 'scale(' + toolScale + ')',
    left: -(($tools.width() + 30) * toolScale)
  });

  $tools.toggleClass('transition', true);
}


// Warn the user on close about cancelling jobs.
mode.onClose = function(callback) {
  if (buffer.length) {
    var r = confirm(i18n.t('common.dialog.confirmexit'));
    if (r == true) {
      // As this is a forceful cancel, shove to the front of the queue
      mode.run(['clear', 'park', 'clearlocal'], true);
      callback(); // The user chose to close.
    }
  } else {
    callback(); // Close, as we have nothing the user is waiting on.
  }
}

// Actual pen update event
mode.onPenUpdate = function(botPen){
  paper.canvas.drawPoint.move(botPen.absCoord, botPen.lastDuration);
  actualPen = $.extend({}, botPen);

  // Add selection from last machine tool
  $('.selected').removeClass('selected');
  $('#' + actualPen.media.replace('dip', '')).addClass('selected');

  // Update button text/state
  // TODO: change implement type <brush> based on actual implement selected!
  var key = 'common.action.brush.raise';
  if (actualPen.state === "up" || actualPen.state < 0.5){
    key = 'common.action.brush.lower';
  }
  $('#pen').text(i18n.t(key));
}

// An abbreviated buffer update event, contains paused/not paused & length.
mode.onBufferUpdate = function(b) {
  buffer = b;
}
