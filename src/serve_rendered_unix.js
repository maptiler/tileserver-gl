'use strict';

// sharp has to be imported before node-canvas on linux. see https://github.com/lovell/sharp/issues/371
import sharp from 'sharp';
import { createCanvas, Image } from 'canvas';

export { sharp, createCanvas, Image };
