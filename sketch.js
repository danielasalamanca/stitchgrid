const CELLS_PER_BLOCK = 10;

let colBlocks = 3;
let rowBlocks = 3;
let cols = colBlocks * CELLS_PER_BLOCK;
let rows = rowBlocks * CELLS_PER_BLOCK;
let size = 20;
let gridColor = "#c8c8c8";
let fillColor = "#000000";
let bgColor = "#ffffff";
let fillShape = "square";

let grid = [];
let controls = {};
let canvasElement;
let wrapperElement;
let lastPointerEvent = null;
let history = [];
let redoHistory = [];
let currentStroke = null;
let strokeValue = 1;
let refImage = null;
let refOpacity = 0.4;
let refScale = 1.0;
let refOffsetX = 0;
let refOffsetY = 0;
let refMoveMode = false;
let isDraggingRef = false;
let refDragStartMouseX = 0;
let refDragStartMouseY = 0;
let refDragStartOffsetX = 0;
let refDragStartOffsetY = 0;

let zoom = 1;
let baseSize = 20;

function setup() {
  pixelDensity(1);
  noSmooth();

  controls = {
    cols: document.getElementById("cols"),
    rows: document.getElementById("rows"),
    gridColor: document.getElementById("gridColor"),
    fillColor: document.getElementById("fillColor"),
    bgColor: document.getElementById("bgColor"),
    applyButton: document.getElementById("applyButton"),
    undoButton: document.getElementById("undoButton"),
    clearButton: document.getElementById("clearButton"),
    refImage: document.getElementById("refImage"),
    refOpacity: document.getElementById("refOpacity"),
    refScale: document.getElementById("refScale"),
    removeRefImage: document.getElementById("removeRefImage"),
    refOpacityRow: document.getElementById("refOpacityRow"),
    refScaleRow: document.getElementById("refScaleRow"),
    refMoveRow: document.getElementById("refMoveRow"),
    refMoveToggle: document.getElementById("refMoveToggle"),
    shapeSquare: document.getElementById("shapeSquare"),
    shapeCircle: document.getElementById("shapeCircle"),
    shapeCross: document.getElementById("shapeCross"),
    zoomInButton: document.getElementById("zoomInButton"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    zoomLabel: document.getElementById("zoomLabel"),
    exportSVGButton: document.getElementById("exportSVGButton"),
  };

  wrapperElement = document.getElementById("canvas-wrapper");

  const canvas = createCanvas(cols * size, rows * size);
  canvas.parent("canvas-stage");
  canvas.mousePressed(handleCanvasPress);
  canvas.mouseReleased(handleCanvasRelease);
  canvasElement = canvas.elt;
  wireControls();
  updateCanvasSize();
  resetGrid();
  updateUndoButton();

  noLoop();
  redraw();

  window.addEventListener("resize", () => { updateCanvasSize(); redraw(); });
  window.addEventListener("mouseup", () => {
    if (isDraggingRef) {
      isDraggingRef = false;
      canvasElement.style.cursor = refMoveMode ? "grab" : "";
      return;
    }
    commitStroke();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      redoLastAction();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();
      undoLastAction();
    }
  });

  const controlsPanel = document.querySelector(".controls-panel");
  if (controlsPanel) {
    controlsPanel.addEventListener("toggle", () => {
      window.requestAnimationFrame(() => { updateCanvasSize(); redraw(); });
    });
  }
}

function wireControls() {
  controls.applyButton.addEventListener("click", applySettings);
  controls.undoButton.addEventListener("click", undoLastAction);
  controls.clearButton.addEventListener("click", clearGrid);
  controls.exportSVGButton.addEventListener("click", exportSVG);

  for (const input of [controls.cols, controls.rows]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applySettings();
      }
    });
  }

  for (const input of [controls.gridColor, controls.fillColor, controls.bgColor]) {
    input.addEventListener("input", applySettings);
  }

  controls.refImage.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      loadImage(e.target.result, (img) => {
        refImage = img;
        controls.refOpacityRow.style.display = "";
        controls.refScaleRow.style.display = "";
        controls.refMoveRow.style.display = "";
        controls.removeRefImage.style.display = "";
        redraw();
      });
    };
    reader.readAsDataURL(file);
  });

  controls.refOpacity.addEventListener("input", () => {
    refOpacity = Number(controls.refOpacity.value) / 100;
    redraw();
  });

  controls.refScale.addEventListener("input", () => {
    refScale = Number(controls.refScale.value) / 100;
    redraw();
  });

  controls.removeRefImage.addEventListener("click", () => {
    refImage = null;
    refOffsetX = 0;
    refOffsetY = 0;
    refMoveMode = false;
    controls.refMoveToggle.classList.remove("btn-mode--active");
    controls.refImage.value = "";
    controls.refOpacityRow.style.display = "none";
    controls.refScaleRow.style.display = "none";
    controls.refMoveRow.style.display = "none";
    controls.removeRefImage.style.display = "none";
    canvasElement.style.cursor = "";
    redraw();
  });

  const shapeButtons = {
    square: controls.shapeSquare,
    circle: controls.shapeCircle,
    cross: controls.shapeCross,
  };
  for (const [shape, btn] of Object.entries(shapeButtons)) {
    btn.addEventListener("click", () => {
      fillShape = shape;
      for (const b of Object.values(shapeButtons)) b.classList.remove("btn-shape--active");
      btn.classList.add("btn-shape--active");
      redraw();
    });
  }

  controls.refMoveToggle.addEventListener("click", () => {
    refMoveMode = !refMoveMode;
    controls.refMoveToggle.classList.toggle("btn-mode--active", refMoveMode);
    canvasElement.style.cursor = refMoveMode ? "grab" : "";
  });

  controls.zoomInButton.addEventListener("click", () => {
    const anchorPoint = getPreferredZoomPoint();
    changeZoom(zoom * 1.5, anchorPoint?.x, anchorPoint?.y);
  });
  controls.zoomOutButton.addEventListener("click", () => {
    const anchorPoint = getPreferredZoomPoint();
    changeZoom(zoom / 1.5, anchorPoint?.x, anchorPoint?.y);
  });

  canvasElement.addEventListener("mousemove", rememberPointerEvent);
  canvasElement.addEventListener("mouseenter", rememberPointerEvent);

  canvasElement.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 / 1.2 : 1.2;
    rememberPointerEvent(event);
    changeZoom(zoom * delta, event.clientX, event.clientY);
  }, { passive: false });
}

function draw() {
  background(bgColor);

  if (refImage) {
    const imgW = width * refScale;
    const imgH = imgW * (refImage.height / refImage.width);
    const imgX = (width - imgW) / 2 + refOffsetX;
    const imgY = (height - imgH) / 2 + refOffsetY;
    tint(255, refOpacity * 255);
    image(refImage, imgX, imgY, imgW, imgH);
    noTint();
  }

  const padding = Math.max(1, size * 0.1);
  const fillSize = size - padding * 2;
  const gridStrokeWeight = Math.max(0.35, Math.min(1, zoom));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cellValue = grid[y] && grid[y][x] !== undefined ? grid[y][x] : 0;

      stroke(gridColor);
      strokeWeight(gridStrokeWeight);
      noFill();
      rect(x * size, y * size, size, size);

      if (cellValue === 1) {
        const cx = x * size + size / 2;
        const cy = y * size + size / 2;
        if (fillShape === "circle") {
          noStroke();
          fill(fillColor);
          ellipse(cx, cy, fillSize, fillSize);
        } else if (fillShape === "cross") {
          const arm = fillSize / 2 * 0.65;
          stroke(fillColor);
          strokeWeight(fillSize * 0.18);
          strokeCap(ROUND);
          line(cx - arm, cy - arm, cx + arm, cy + arm);
          line(cx + arm, cy - arm, cx - arm, cy + arm);
          strokeCap(SQUARE);
          strokeWeight(1);
        } else {
          noStroke();
          fill(fillColor);
          rect(x * size + padding, y * size + padding, fillSize, fillSize);
        }
      }
    }
  }
}

function handleCanvasPress(event) {
  if (refMoveMode) {
    const pointer = getCanvasPointer(event);
    if (pointer) {
      isDraggingRef = true;
      refDragStartMouseX = pointer.x;
      refDragStartMouseY = pointer.y;
      refDragStartOffsetX = refOffsetX;
      refDragStartOffsetY = refOffsetY;
      canvasElement.style.cursor = "grabbing";
    }
    return;
  }
  const pointer = getCanvasPointer(event);
  if (pointer) {
    const x = floor(pointer.x / size);
    const y = floor(pointer.y / size);
    strokeValue = insideGrid(x, y) && grid[y][x] === 1 ? 0 : 1;
  }
  beginStroke();
  paint(event);
}

function mouseDragged(event) {
  if (isDraggingRef) {
    const pointer = getCanvasPointer(event);
    if (pointer) {
      refOffsetX = refDragStartOffsetX + (pointer.x - refDragStartMouseX);
      refOffsetY = refDragStartOffsetY + (pointer.y - refDragStartMouseY);
      redraw();
    }
    return;
  }

  if (!currentStroke) {
    return;
  }

  paint(event);
}


function handleCanvasRelease() {
  if (isDraggingRef) {
    isDraggingRef = false;
    canvasElement.style.cursor = refMoveMode ? "grab" : "";
    return;
  }
  commitStroke();
}

function paint(event) {
  const pointer = getCanvasPointer(event);

  if (!pointer) {
    return;
  }

  let x = floor(pointer.x / size);
  let y = floor(pointer.y / size);

  if (insideGrid(x, y) && grid[y][x] !== strokeValue) {
    rememberCellChange(currentStroke, x, y, grid[y][x], strokeValue);
    grid[y][x] = strokeValue;
    redraw();
  }
}

function clearGrid() {
  commitStroke();

  const clearAction = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== 0) {
        clearAction.push({ x, y, previousValue: grid[y][x], nextValue: 0 });
      }
    }
  }

  if (clearAction.length > 0) {
    history.push(clearAction);
    redoHistory = [];
    updateUndoButton();
  }

  resetGrid();
  redraw();
}

function applySettings() {
  const nextColBlocks = constrainValue(controls.cols.value, 1, 50, colBlocks);
  const nextRowBlocks = constrainValue(controls.rows.value, 1, 50, rowBlocks);

  controls.cols.value = nextColBlocks;
  controls.rows.value = nextRowBlocks;

  const shouldResize = nextColBlocks !== colBlocks || nextRowBlocks !== rowBlocks;

  colBlocks = nextColBlocks;
  rowBlocks = nextRowBlocks;
  cols = colBlocks * CELLS_PER_BLOCK;
  rows = rowBlocks * CELLS_PER_BLOCK;
  gridColor = controls.gridColor.value;
  fillColor = controls.fillColor.value;
  bgColor = controls.bgColor.value;

  if (shouldResize) {
    resetGrid();
    updateCanvasSize();
    history = [];
    redoHistory = [];
    currentStroke = null;
    updateUndoButton();
  } else {
    updateCanvasSize();
  }
  redraw();
}

function resetGrid() {
  grid = [];

  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      grid[y][x] = 0;
    }
  }
}

function constrainValue(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function insideGrid(x, y) {
  return x >= 0 && x < cols && y >= 0 && y < rows;
}

function insideCanvas(x, y) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

function getCanvasPointer(event) {
  if (!canvasElement) {
    return null;
  }

  if (event) {
    lastPointerEvent = event;
  }

  const bounds = canvasElement.getBoundingClientRect();
  const pointerEvent = event || lastPointerEvent;

  if (!pointerEvent || bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const relativeX = (pointerEvent.clientX - bounds.left) * (width / bounds.width);
  const relativeY = (pointerEvent.clientY - bounds.top) * (height / bounds.height);

  if (!insideCanvas(relativeX, relativeY)) {
    return null;
  }

  return { x: relativeX, y: relativeY };
}

function rememberPointerEvent(event) {
  lastPointerEvent = event;
}

function getPreferredZoomPoint() {
  if (!lastPointerEvent || !canvasElement) {
    return null;
  }

  const bounds = canvasElement.getBoundingClientRect();
  const { clientX, clientY } = lastPointerEvent;

  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
    return null;
  }

  return { x: clientX, y: clientY };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getZoomAnchor(clientX, clientY) {
  if (!wrapperElement || !canvasElement) {
    return null;
  }

  const wrapperBounds = wrapperElement.getBoundingClientRect();
  const canvasBounds = canvasElement.getBoundingClientRect();
  const fallbackClientX = wrapperBounds.left + wrapperElement.clientWidth / 2;
  const fallbackClientY = wrapperBounds.top + Math.min(wrapperElement.clientHeight || canvasBounds.height, canvasBounds.height) / 2;
  const anchorClientX = clientX ?? fallbackClientX;
  const anchorClientY = clientY ?? fallbackClientY;

  return {
    clientX: anchorClientX,
    clientY: anchorClientY,
    viewportX: anchorClientX - wrapperBounds.left,
    viewportY: anchorClientY - wrapperBounds.top,
    ratioX: canvasBounds.width > 0 ? clamp((anchorClientX - canvasBounds.left) / canvasBounds.width, 0, 1) : 0.5,
    ratioY: canvasBounds.height > 0 ? clamp((anchorClientY - canvasBounds.top) / canvasBounds.height, 0, 1) : 0.5,
  };
}

function applyZoomAnchor(anchor) {
  if (!anchor || !wrapperElement || !canvasElement) {
    return;
  }

  const targetScrollLeft = canvasElement.offsetLeft + canvasElement.offsetWidth * anchor.ratioX - anchor.viewportX;
  const targetScrollTop = canvasElement.offsetTop + canvasElement.offsetHeight * anchor.ratioY - anchor.viewportY;
  const maxScrollLeft = Math.max(0, wrapperElement.scrollWidth - wrapperElement.clientWidth);
  const maxScrollTop = Math.max(0, wrapperElement.scrollHeight - wrapperElement.clientHeight);

  wrapperElement.scrollLeft = clamp(targetScrollLeft, 0, maxScrollLeft);
  wrapperElement.scrollTop = clamp(targetScrollTop, 0, maxScrollTop);

  const canvasBounds = canvasElement.getBoundingClientRect();
  const nextClientY = canvasBounds.top + canvasBounds.height * anchor.ratioY;
  const deltaY = nextClientY - anchor.clientY;

  if (Math.abs(deltaY) > 0.5) {
    window.scrollBy({ top: deltaY, behavior: "auto" });
  }
}

function updateCanvasSize() {
  if (!canvasElement) {
    return;
  }

  const wrapper = document.getElementById("canvas-wrapper");
  const wrapperWidth = wrapper ? wrapper.clientWidth : window.innerWidth - 32;
  const availableWidth = Math.max(wrapperWidth - 2, 120);
  baseSize = Math.max(2, Math.floor(availableWidth / cols));
  size = Math.max(1, Math.round(baseSize * zoom));

  const canvasWidth = cols * size;
  const canvasHeight = rows * size;

  resizeCanvas(canvasWidth, canvasHeight);
  canvasElement.style.width = `${canvasWidth}px`;
  canvasElement.style.height = `${canvasHeight}px`;
}

function changeZoom(nextZoom, anchorClientX, anchorClientY) {
  const clampedZoom = Math.max(0.25, Math.min(8, nextZoom));

  if (clampedZoom === zoom) {
    return;
  }

  const anchor = getZoomAnchor(anchorClientX, anchorClientY);
  zoom = clampedZoom;
  updateCanvasSize();
  applyZoomAnchor(anchor);
  updateZoomLabel();
  redraw();
}

function updateZoomLabel() {
  if (controls.zoomLabel) {
    controls.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
}

function exportSVG() {
  const cellSize = 20;
  const pad = Math.max(1, cellSize * 0.1);
  const fillSize = cellSize - pad * 2;
  const svgW = cols * cellSize;
  const svgH = rows * cellSize;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`);

  // Background
  parts.push(`<rect width="${svgW}" height="${svgH}" fill="${bgColor}"/>`);

  // Filled cells
  const crossArm = (fillSize / 2) * 0.65;
  const crossSW = fillSize * 0.10;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] === 1) {
        const cx = x * cellSize + cellSize / 2;
        const cy = y * cellSize + cellSize / 2;
        if (fillShape === "circle") {
          parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${fillSize / 2}" ry="${fillSize / 2}" fill="${fillColor}"/>`);
        } else if (fillShape === "cross") {
          parts.push(`<line x1="${cx - crossArm}" y1="${cy - crossArm}" x2="${cx + crossArm}" y2="${cy + crossArm}" stroke="${fillColor}" stroke-width="${crossSW}" stroke-linecap="round"/>`);
          parts.push(`<line x1="${cx + crossArm}" y1="${cy - crossArm}" x2="${cx - crossArm}" y2="${cy + crossArm}" stroke="${fillColor}" stroke-width="${crossSW}" stroke-linecap="round"/>`);
        } else {
          parts.push(`<rect x="${x * cellSize + pad}" y="${y * cellSize + pad}" width="${fillSize}" height="${fillSize}" fill="${fillColor}"/>`);
        }
      }
    }
  }

  // Grid lines (single path)
  let d = "";
  for (let y = 0; y <= rows; y++) d += `M0 ${y * cellSize}H${svgW}`;
  for (let x = 0; x <= cols; x++) d += `M${x * cellSize} 0V${svgH}`;
  parts.push(`<path d="${d}" stroke="${gridColor}" stroke-width="1" fill="none"/>`);

  parts.push("</svg>");

  const blob = new Blob([parts.join("")], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stitchgrid.svg";
  a.click();
  URL.revokeObjectURL(url);
}

function beginStroke() {
  currentStroke = [];
}

function commitStroke() {
  if (currentStroke && currentStroke.length > 0) {
    history.push(currentStroke);
    redoHistory = [];
    updateUndoButton();
  }

  currentStroke = null;
}

function rememberCellChange(action, x, y, previousValue, nextValue) {
  if (!action) {
    return;
  }

  action.push({ x, y, previousValue, nextValue });
}

function undoLastAction() {
  commitStroke();

  const action = history.pop();

  if (!action) {
    updateUndoButton();
    return;
  }

  redoHistory.push(action);
  for (const change of action) {
    grid[change.y][change.x] = change.previousValue;
  }

  updateUndoButton();
  redraw();
}

function redoLastAction() {
  commitStroke();

  const action = redoHistory.pop();

  if (!action) {
    return;
  }

  history.push(action);
  for (const change of action) {
    grid[change.y][change.x] = change.nextValue;
  }

  updateUndoButton();
  redraw();
}

function updateUndoButton() {
  if (!controls.undoButton) {
    return;
  }

  controls.undoButton.disabled = history.length === 0;
}
