import { WebGLRenderer } from 'three'

// Module-scope renderer: constructed on import, on the server as well, shared and never disposed.
export const renderer = new WebGLRenderer()
