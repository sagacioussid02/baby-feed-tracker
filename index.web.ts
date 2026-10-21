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
import React from 'react';
import { Text, View } from 'react-native';

LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })
  .then(async () => {
    const { default: App } = await import('./App');
    registerRootComponent(App);
  })
  .catch((e) => {
    console.warn('[skia] CanvasKit failed to load', e);
    registerRootComponent(() =>
      React.createElement(
        View,
        { style: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 } },
        React.createElement(
          Text,
          null,
          'Unable to initialize the graphics engine. Reload the page to try again.',
        ),
      ),
    );
  });
