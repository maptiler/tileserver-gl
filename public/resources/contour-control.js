class MaplibreContourControl {
  constructor(options) {
    this.source = options["source"];
    this.confLayers = options["layers"];
    this.visibility = options["visibility"];
  }

  getDefaultPosition() {
    const defaultPosition = "top-right";
    return defaultPosition;
  }

  onAdd(map) {
    this.map = map;
    this.controlContainer = document.createElement("div");
    this.controlContainer.classList.add("maplibregl-ctrl");
    this.controlContainer.classList.add("maplibregl-ctrl-group");
    this.contourButton = document.createElement("button");
    this.contourButton.type = "button";
    this.contourButton.textContent = "C";

    this.map.on("style.load", () => {
      this.confLayers.forEach(layer => {
        this.map.setLayoutProperty(layer, "visibility", this.visibility ? "visible" : "none");
        if (this.visibility) {
          this.controlContainer.classList.add("maplibre-ctrl-contour-active");
          this.contourButton.title = "Disable Contours";
        } else {
          this.contourButton.title = "Enable Contours";
        }
      });
    });

    this.contourButton.addEventListener("click", () => {
      this.confLayers.forEach(layer => {
        var visibility = this.map.getLayoutProperty(layer, "visibility");
        if (visibility === "visible") {
          this.map.setLayoutProperty(layer, "visibility", "none");
          this.controlContainer.classList.remove("maplibre-ctrl-contour-active");
          this.contourButton.title = "Disable Contours";
        } else {
          this.controlContainer.classList.add("maplibre-ctrl-contour-active");
          this.map.setLayoutProperty(layer, "visibility", "visible");
          this.contourButton.title = "Enable Contours";
        }
      });
    });
    this.controlContainer.appendChild(this.contourButton);
    return this.controlContainer;
  }

  onRemove() {
    if (
      !this.controlContainer ||
      !this.controlContainer.parentNode ||
      !this.map ||
      !this.contourButton
    ) {
      return;
    }
    this.contourButton.removeEventListener("click");
    this.controlContainer.parentNode.removeChild(this.controlContainer);
    this.map = undefined;
  }
};
