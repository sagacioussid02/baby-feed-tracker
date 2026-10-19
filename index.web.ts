/**
 * Web entry — loads Skia's CanvasKit WASM before rendering.
 * (Native entry index.ts renders immediately; Skia is native there.)
 *
 * The wasm is copied to `public/canvaskit.wasm` (see postinstall in
 * package.json); `expo export` copies `public/` to the dist root, so
 * locateFile points at the site root.
 */
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

import App from './App';

LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })
  .then(() => {
    registerRootComponent(App);
  })
  .catch((e) => {
    // If CanvasKit fails to load, still render the app — Skia canvases
    // will be blank, but the rest of the app (logging, timeline) works.
    console.warn('[skia] CanvasKit failed to load', e);
    registerRootComponent(App);
  });
