const DIAGRAM_SELECTOR = '.vp-doc .mermaid'
const INSTALLED_KEY = '__whirredDiagramLightboxInstalled'

type LightboxWindow = Window & {
  [INSTALLED_KEY]?: boolean
}

function prepareDiagram(element: Element) {
  if (!(element instanceof HTMLElement)) return

  element.tabIndex = 0
  element.setAttribute('role', 'button')
  element.setAttribute('aria-label', 'Open diagram in full-screen view')
  element.setAttribute('title', 'Click to view this diagram full screen')
}

function prepareDiagrams(root: ParentNode = document) {
  root.querySelectorAll(DIAGRAM_SELECTOR).forEach(prepareDiagram)
}

function createDialog() {
  const dialog = document.createElement('dialog')
  dialog.className = 'diagram-lightbox'
  dialog.setAttribute('aria-label', 'Full-screen diagram')

  const toolbar = document.createElement('div')
  toolbar.className = 'diagram-lightbox__toolbar'

  const hint = document.createElement('span')
  hint.textContent = 'Full-screen diagram'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'diagram-lightbox__close'
  close.textContent = 'Close'
  close.addEventListener('click', () => dialog.close())

  const canvas = document.createElement('div')
  canvas.className = 'diagram-lightbox__canvas'

  toolbar.append(hint, close)
  dialog.append(toolbar, canvas)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => canvas.replaceChildren())
  document.body.append(dialog)

  return { dialog, canvas, close }
}

export function installDiagramLightbox() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const lightboxWindow = window as LightboxWindow
  if (lightboxWindow[INSTALLED_KEY]) return
  lightboxWindow[INSTALLED_KEY] = true

  const { dialog, canvas, close } = createDialog()

  function openDiagram(diagram: HTMLElement) {
    const svg = diagram.querySelector('svg')
    if (!svg) return

    canvas.replaceChildren(svg.cloneNode(true))
    dialog.showModal()
    close.focus()
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('a')) return

    const diagram = target.closest(DIAGRAM_SELECTOR)
    if (diagram instanceof HTMLElement) openDiagram(diagram)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.matches(DIAGRAM_SELECTOR)) return

    event.preventDefault()
    openDiagram(target)
  })

  prepareDiagrams()
  new MutationObserver(() => prepareDiagrams()).observe(document.body, {
    childList: true,
    subtree: true
  })
}
