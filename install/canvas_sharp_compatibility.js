"use strict";

import * as process from 'process';
import * as child_process from 'child_process';
import * as url from 'url';
import * as path from 'path';

const originalPath = process.cwd();

process.chdir(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..'))

if (process.platform == 'win32' && (process.arch == 'ia32' || process.arch == 'x64')) {
    child_process.spawn('powershell.exe', [ '-ExecutionPolicy', 'Bypass', '-File', 'install\\win32.ps1', process.arch ])
}

process.chdir(originalPath);
