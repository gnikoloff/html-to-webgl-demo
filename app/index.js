import svgToMiniDataURI from 'mini-svg-data-uri'
import * as twgl from 'twgl.js'
import Prism from 'prismjs'

import 'prismjs/themes/prism-funky.css'
import 'prismjs/themes/prism.css'
import './index.scss'

const domElementToRender = document.getElementById('html-to-render')

// Let's grab the input HTML el width and height
const {
  width: domElementWidth,
  height: domElementHeight,
} = domElementToRender.getBoundingClientRect()


// OPTIONAL
// Compute all style properties for each element inside the HTML we want to render and inline them
// Ideally, your styling should be inline so you can omit this expensive step (this is the approach this demo takes)

// const allChildrenInsideDomElement = domElementToRender.querySelectorAll('*')
// for (let i = 0; i < allChildrenInsideDomElement.length; i++) {
//   const child = allChildrenInsideDomElement[i]
//   const style = getComputedStyle(child)
//   child.style = style.cssText
// }


// Turns our Chrome returns images not self closed. Let's simply cover our use case
let domElementHTML = domElementToRender.innerHTML
domElementHTML = domElementHTML.replaceAll('.png">', '.png"/>')
domElementHTML = domElementHTML.replaceAll('.jpg">', '.jpg"/>')
// Do any other transformation on your domElementHTML string here

// 1. We need to fetch the images and base64 them into the html fragment
base64ImageSources(domElementHTML)
  // 2. Once the images are inlined, lets put the generated html markup inside a <foreignObject/>
  .then(insertFragmentIntoForeignObject)
  // 3. Supply the generated canvas texture to a webgl context and draw it on a quad
  .then(renderCanvasIntoGLTexture)


// ------------ utils ------------

function insertFragmentIntoForeignObject (inputFragment) {
  const svgSource = constructSVGWithForeignObject(inputFragment)
  appendCurrentStepToSection('svg-render', svgSource)
  return makeCanvasFromSVGFragment(svgSource)
}

function renderCanvasIntoGLTexture (canvasToRenderAsWebGLTexture) {
  appendCurrentStepToSection('canvas-render', canvasToRenderAsWebGLTexture)
  renderCanvasAsWebGLContext(canvasToRenderAsWebGLTexture)
}

function renderCanvasAsWebGLContext (canvasToDraw) {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

  gl.canvas.width = canvasToDraw.width
  gl.canvas.height = canvasToDraw.height

  appendCurrentStepToSection('webgl-render', canvas)

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
    
    uniform sampler2D texture;
    uniform float time;

    void main () {
      vec2 viewPortWidth = vec2(${gl.canvas.width}.0, ${gl.canvas.height}.0);

      vec2 uv = gl_FragCoord.xy / viewPortWidth;
      uv.y = 1.0 - uv.y;
      gl_FragColor = texture2D(texture, uv + vec2(
        sin(uv.y * 10.0 - time * .001) * 0.02,
        cos(uv.x * 20.0 + time * .001) * 0.01
      ));
    }
  `
  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasToDraw)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  const uniforms = {
    texture,
  }

  const texLocation = gl.getUniformLocation(programInfo.program, 'texture')
  const timeLocation = gl.getUniformLocation(programInfo.program, 'time')

  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo)

  rAf()

  function rAf (ts = 0) {
    gl.useProgram(programInfo.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(texLocation, 0)
    gl.uniform1f(timeLocation, ts)
    twgl.setUniforms(programInfo, uniforms)
    twgl.drawBufferInfo(gl, bufferInfo)
    
    requestAnimationFrame(rAf)
  }

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
    // 1. Use helper library to encode fragment
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

function base64ImageSources (fragment) {
  // 1. get all image sources
  const sources = (fragment.match(/<img [^>]*src="[^"]*"[^>]*>/gm) || []).map(x => x.replace(/.*src="([^"]*)".*/, '$1'))
  // 2. to render our images to svg <foreignObject /> we need to load them first and base64 encode them, which is asynchronous
  console.log(sources)
  return new Promise((resolve, reject) => {
    Promise
      .all(sources.map(encodeImageToBase64))
      .then(base64s => {
        for (let i = 0; i < base64s.length; i++) {
          const base64Source = base64s[i]
          const originalSource = sources[i]
          // 3. Once we have the base64 representation of the image, replace the original external source with it
          fragment = fragment.replace(originalSource, base64Source)
        }
        resolve(fragment)
      })
  })
                                 
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
    console.log(src)
  })
}

function appendCurrentStepToSection (sectionName, el) {
  const sectionEl = document.querySelector(`[data-name=${sectionName}]`)
  const renderOutputEl = sectionEl.getElementsByClassName('step-render')[0]
  if (typeof el === 'string') {
    renderOutputEl.innerHTML = el
  } else {
    renderOutputEl.appendChild(el)
  }
}
