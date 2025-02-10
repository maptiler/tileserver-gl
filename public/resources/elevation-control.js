class ElevationInfoControl {
    constructor(options) {
      this.url = options["url"];
    }

    getDefaultPosition() {
      const defaultPosition = "bottom-left";
      return defaultPosition;
    }

    onAdd(map) {
      this.map = map;
      this.controlContainer = document.createElement("div");
      this.controlContainer.classList.add("maplibregl-ctrl");
      this.controlContainer.classList.add("maplibregl-ctrl-group");
      this.controlContainer.classList.add("maplibre-ctrl-elevation");
      this.controlContainer.textContent = "Elevation: Click on Map";

      map.on('click', (e) => {
        var url = this.url;
        var coord = {"z": Math.floor(map.getZoom()), "x": e.lngLat["lng"].toFixed(7), "y": e.lngLat["lat"].toFixed(7)};
        for(var key in coord) {
          url = url.replace(new RegExp('{'+ key +'}','g'), coord[key]);
        }

        let request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.onload = () => {
          if (request.status !== 200) {
            this.controlContainer.textContent = "Elevation: No value";
          } else {
            this.controlContainer.textContent = `Elevation: ${JSON.parse(request.responseText).elevation} (${JSON.stringify(coord)})`;
          }
        }
        request.send();
      });
      return this.controlContainer;
    }

    onRemove() {
      if (
        !this.controlContainer ||
        !this.controlContainer.parentNode ||
        !this.map
      ) {
        return;
      }
      this.controlContainer.parentNode.removeChild(this.controlContainer);
      this.map = undefined;
    }
  };
