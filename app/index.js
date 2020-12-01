console.clear()

import svgToMiniDataURI from 'mini-svg-data-uri'
import * as twgl from 'twgl.js'

const domElementToRender = document.getElementById('my-message')

const {
  width: domElementWidth,
  height: domElementHeight,
} = domElementToRender.getBoundingClientRect()

// Compute all style properties for each element inside the HTML we want to render and inline them
// Ideally, your styling should be inline so you can omit this expensive step
const allChildrenInsideDomElement = domElementToRender.querySelectorAll('*')
for (let i = 0; i < allChildrenInsideDomElement.length; i++) {
  const child = allChildrenInsideDomElement[i]
  const style = getComputedStyle(child)
  child.style = style.cssText
}
const domElementHTML = domElementToRender.innerHTML

let fragmentWithBase64Images = encodeImagesToFragment(domElementHTML)
fragmentWithBase64Images = constructSVGWithForeignObject(fragmentWithBase64Images)

makeCanvasFromSVGFragment(fragmentWithBase64Images).then(canvasToRenderAsWebGLTexture => {
  document.body.appendChild(canvasToRenderAsWebGLTexture)
  renderCanvasAsWebGLContext(canvasToRenderAsWebGLTexture)
})

// console.log(getComputedStyle(domElementToRender))

document.write(fragmentWithBase64Images)

// ------------ utils ------------

function renderCanvasAsWebGLContext (canvasToDraw) {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

  gl.canvas.width = canvasToDraw.width
  gl.canvas.height = canvasToDraw.height

  document.body.appendChild(canvas)

  const arrays = {
    position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0]
  }
  const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays)
  twgl.resizeCanvasToDisplaySize(gl.canvas)
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

  const vertexShaderSource = `
    precision highp float;
    attribute vec2 position;
    void main () {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `
  const fragmentShaderSource = `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `
  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);

  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo)
  // twgl.setUniforms(programInfo, uniforms)
  twgl.drawBufferInfo(gl, bufferInfo)

}

function makeCanvasFromSVGFragment (fragment) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      // 2. Draw the SVG fragment containing our original HTML into canvas
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('could not draw SVG fragment into canvas'))
    // Use helper library to encode fragment
    img.src = svgToMiniDataURI(fragment)
    console.log(img.src)
  })
}

function constructSVGWithForeignObject (fragment) {
  const svgFragment = `
    <svg
      viewBox='0 0 ${domElementWidth} ${domElementHeight}'
      width="${domElementWidth}"
      height="${domElementHeight}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <foreignObject
        x="0"
        y="0"
        width="${domElementWidth}"
        height="${domElementHeight}"
      >
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${fragment}
        </div>
      </foreignObject>
    </svg>
  `
  return svgFragment
}

function encodeImagesToFragment (fragment) {
  // 1. get all image sources
  const sources = (fragment.match(/<img [^>]*src="[^"]*"[^>]*>/gm) || []).map(x => x.replace(/.*src="([^"]*)".*/, '$1'))
  // 2. to render our images to svg <foreignObject /> we need to load them first and base64 encode them, which is asynchronous
  Promise
    .all(sources.map(encodeImageToBase64))
    .then(base64s => {
      for (let i = 0; i < base64s.length; i++) {
        const base64Source = base64s[i]
        const originalSource = sources[i]
        // 3. Once we have the base64 representation of the image, replace the original external source with it
        fragment = fragment.replace(originalSource, base64Source) 
      }
    })
  
  return fragment
                                 
}

function encodeImageToBase64 (src) {
  return new Promise((resolve, reject) => {
    // 1. Create canvas to draw the image to
    const img = new Image()
    // 2. Wait for the image to load
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      
      // 3. Once loaded draw the image into the canvas
      ctx.drawImage(img, 0, 0)
      // 4. Finally resolve the promise with the base64 result
      resolve(canvas.toDataURL())
    }
    img.onerror = () => reject(new Error('could not load provided image'))
    img.crossOrigin = 'Anonymous'
    img.src = src
  })
}
