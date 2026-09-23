/// <reference types="nativewind/types" />

// NativeWind resolves `global.css` through Metro, so TypeScript only needs to
// know the module exists for the side-effect import in the root layout.
declare module '*.css';
