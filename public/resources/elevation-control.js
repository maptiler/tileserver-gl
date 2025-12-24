class ElevationInfoControl {
    constructor(options) {
      this.url = options["url"];
      this.originalTerrain = null;
      this.suppressDEMErrors = true;
      this.setupErrorHandler();
    }

    setupErrorHandler() {
      // Suppress DEM out-of-range errors that occur when placing markers at coordinates outside DEM coverage
      const originalHandler = window.onerror;
      window.onerror = (msg, url, line, col, error) => {
        if (error && error.message && error.message.includes('out of range source coordinates for DEM data')) {
          console.warn("DEM coordinate out of range (suppressed):", error);
          return true; // Suppress the error
        }
        // Call original handler if it exists
        if (typeof originalHandler === 'function') {
          return originalHandler(msg, url, line, col, error);
        }
      };

      // Also suppress promise rejections for DEM errors
      const originalHandler2 = window.onunhandledrejection;
      window.onunhandledrejection = (event) => {
        if (event.reason && event.reason.message && event.reason.message.includes('out of range source coordinates for DEM data')) {
          console.warn("DEM coordinate out of range (suppressed):", event.reason);
          event.preventDefault();
          return true;
        }
        // Call original handler if it exists
        if (typeof originalHandler2 === 'function') {
          return originalHandler2(event);
        }
      };
    }

    getDefaultPosition() {
      const defaultPosition = "bottom-left";
      return defaultPosition;
    }

    onAdd(map) {
      this.map = map;
      this.originalTerrain = map.getTerrain();
      this.controlContainer = document.createElement("div");
      this.controlContainer.classList.add("maplibregl-ctrl");
      this.controlContainer.classList.add("maplibregl-ctrl-group");
      this.controlContainer.classList.add("maplibre-ctrl-elevation");
      this.controlContainer.textContent = "Elevation: Click on Map";

      this.marker = new maplibregl.Marker();

      map.on('click', (e) => {
        if (!map.transform.isPointOnMapSurface(e.point)) {
          this.controlContainer.textContent = "Elevation: Click on Globe";
          return;
        }

        var url = this.url;
        var lngLat = e.lngLat;
        
        // Validate coordinates are within valid range
        if (typeof lngLat !== 'object' || typeof lngLat.lng !== 'number' || typeof lngLat.lat !== 'number') {
          this.controlContainer.textContent = "Elevation: Invalid coordinates";
          return;
        }

        var coord = {"z": Math.floor(map.getZoom()), "x": lngLat.lng.toFixed(7), "y": lngLat.lat.toFixed(7)};
        
        for(var key in coord) {
          url = url.replace(new RegExp('{'+ key +'}','g'), coord[key]);
        }

        // Place marker at clicked location
        // Note: Terrain is disabled to prevent DEM errors with markers at out-of-bounds coordinates.
        // The marker conflicts with the terrain system in MapLibre, so we keep terrain disabled.
        const hadTerrain = this.map.getTerrain();
        if (hadTerrain) {
          this.map.setTerrain(null);
        }
        
        try {
          if (this.marker) {
            this.marker.remove();
          }
          
          this.marker = new maplibregl.Marker();
          this.marker.setLngLat({lng: lngLat.lng, lat: lngLat.lat});
          this.marker.addTo(this.map);
        } catch (_err) {
          // If placement fails, continue without marker
          console.error("Marker placement error:", _err);
        }
        // Terrain remains disabled to avoid repeated DEM errors from marker updates

        let request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.onload = () => {
          if (request.status !== 200) {
            this.controlContainer.textContent = "Elevation: No value";
          } else {
            this.controlContainer.textContent = `Elevation: ${JSON.parse(request.responseText).elevation} (${JSON.stringify(coord)})`;
          }
        };
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
      
      // Restore terrain if it was originally enabled
      if (this.originalTerrain && !this.map.getTerrain()) {
        this.map.setTerrain(this.originalTerrain);
      }
      
      if (this.marker) {
        this.marker.remove();
        this.marker = undefined;
      }
      
      this.map = undefined;
    }
  };
