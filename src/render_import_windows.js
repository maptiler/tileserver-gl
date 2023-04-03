'use strict';

// sharp has to be required after node-canvas on windows. see https://github.com/Automattic/node-canvas/issues/2155#issuecomment-1487190125
import { createCanvas, Image } from 'canvas';
import sharp from 'sharp'; 

export {sharp, createCanvas, Image};
