const CELLS_PER_BLOCK = 10;

let colBlocks = 3;
let rowBlocks = 3;
let cols = colBlocks * CELLS_PER_BLOCK;
let rows = rowBlocks * CELLS_PER_BLOCK;
let size = 20;
let gridColor = "#c8c8c8";
let fillColor = "#000000";
let bgColor = "#ffffff";

let grid = [];
let controls = {};
let canvasElement;
let lastPointerEvent = null;
let history = [];
let currentStroke = null;
let refImage = null;
let refOpacity = 0.4;
let refScale = 1.0;

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
    zoomInButton: document.getElementById("zoomInButton"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    zoomLabel: document.getElementById("zoomLabel"),
    exportSVGButton: document.getElementById("exportSVGButton"),
  };

  const canvas = createCanvas(cols * size, rows * size);
  canvas.parent("canvas-wrapper");
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
  window.addEventListener("mouseup", commitStroke);
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "z") {
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
    controls.refImage.value = "";
    controls.refOpacityRow.style.display = "none";
    controls.refScaleRow.style.display = "none";
    controls.removeRefImage.style.display = "none";
    redraw();
  });

  controls.zoomInButton.addEventListener("click", () => changeZoom(zoom * 1.5));
  controls.zoomOutButton.addEventListener("click", () => changeZoom(zoom / 1.5));

  canvasElement.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 / 1.2 : 1.2;
    changeZoom(zoom * delta);
  }, { passive: false });
}

function draw() {
  background(bgColor);

  if (refImage) {
    const imgW = width * refScale;
    const imgH = imgW * (refImage.height / refImage.width);
    const imgX = (width - imgW) / 2;
    const imgY = (height - imgH) / 2;
    tint(255, refOpacity * 255);
    image(refImage, imgX, imgY, imgW, imgH);
    noTint();
  }

  const padding = Math.max(1, size * 0.1);
  const fillSize = size - padding * 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cellValue = grid[y] && grid[y][x] !== undefined ? grid[y][x] : 0;

      stroke(gridColor);
      noFill();
      rect(x * size, y * size, size, size);

      if (cellValue === 1) {
        noStroke();
        fill(fillColor);
        rect(x * size + padding, y * size + padding, fillSize, fillSize);
      }
    }
  }
}

function handleCanvasPress(event) {
  beginStroke();
  paint(event);
}

function mouseDragged(event) {
  if (!currentStroke) {
    return;
  }

  paint(event);
}

function handleCanvasRelease() {
  commitStroke();
}

function paint(event) {
  const pointer = getCanvasPointer(event);

  if (!pointer) {
    return;
  }

  let x = floor(pointer.x / size);
  let y = floor(pointer.y / size);

  if (insideGrid(x, y) && grid[y][x] !== 1) {
    rememberCellChange(currentStroke, x, y, grid[y][x]);
    grid[y][x] = 1;
    redraw();
  }
}

function clearGrid() {
  commitStroke();

  const clearAction = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== 0) {
        clearAction.push({ x, y, previousValue: grid[y][x] });
      }
    }
  }

  if (clearAction.length > 0) {
    history.push(clearAction);
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

function changeZoom(nextZoom) {
  zoom = Math.max(0.25, Math.min(8, nextZoom));
  updateCanvasSize();
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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] === 1) {
        parts.push(`<rect x="${x * cellSize + pad}" y="${y * cellSize + pad}" width="${fillSize}" height="${fillSize}" fill="${fillColor}"/>`);
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
    updateUndoButton();
  }

  currentStroke = null;
}

function rememberCellChange(action, x, y, previousValue) {
  if (!action) {
    return;
  }

  action.push({ x, y, previousValue });
}

function undoLastAction() {
  commitStroke();

  const action = history.pop();

  if (!action) {
    updateUndoButton();
    return;
  }

  for (const change of action) {
    grid[change.y][change.x] = change.previousValue;
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
