import { WebGLRenderer, Scene } from 'three'

// A renderer created when the module is imported: on the server there is no document, in the browser it is shared
// by every component that imports it and never disposed.
export const renderer = new WebGLRenderer({ antialias: true })
export const sharedScene = new Scene()
