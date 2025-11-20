const fs = require('fs');
const path = require('path');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied', src, '->', dest);
}

function copyFiles(pkgName, files, targetDir) {
  const pkgDir = path.join(__dirname, '..', 'node_modules', pkgName);
  if (!fs.existsSync(pkgDir)) {
    console.error('Package not found:', pkgDir);
    process.exit(1);
  }
  files.forEach((f) => {
    const src = path.join(pkgDir, f);
    const dest = path.join(__dirname, '..', 'public', targetDir, f);
    if (!fs.existsSync(src)) {
      console.warn('Missing source file, skipping:', src);
      return;
    }
    copy(src, dest);
  });
}

// pose package
copyFiles('@mediapipe/pose', [
  'pose.js',
  'pose_solution_wasm_bin.wasm',
  'pose_solution_simd_wasm_bin.wasm',
  'pose_solution_packed_assets.data',
  'pose_solution_packed_assets_loader.js'
], 'mediapipe/pose');

// also copy pose graph and model files the loader will request
copyFiles('@mediapipe/pose', [
  'pose_web.binarypb',
  'pose_landmark_lite.tflite',
  'pose_landmark_full.tflite',
  'pose_landmark_heavy.tflite',
  'pose_solution_simd_wasm_bin.data',
  'pose_solution_wasm_bin.js',
  'pose_solution_simd_wasm_bin.js'
], 'mediapipe/pose');

// camera_utils
copyFiles('@mediapipe/camera_utils', ['camera_utils.js'], 'mediapipe/camera_utils');

// drawing_utils
copyFiles('@mediapipe/drawing_utils', ['drawing_utils.js'], 'mediapipe/drawing_utils');

console.log('Done copying MediaPipe assets.');
