function IsDisplayedElement(HTMLElem: HTMLElement): boolean {
  if (!HTMLElem) return false

  const BoundingClientRect = HTMLElem.getBoundingClientRect()
  if (BoundingClientRect.width === 0 || BoundingClientRect.height === 0) return false

  const ComputedStyle = getComputedStyle(HTMLElem)
  if (ComputedStyle.getPropertyValue('display') === 'none') return false

  return true
}

function IsEffectiveHTMLPicture(HTMLElem: HTMLElement): boolean {
  if (HTMLElem.tagName.toLowerCase() !== 'picture') return false
  if (!IsDisplayedElement(HTMLElem)) return false

  const ChildHTMLSourceElements = [...HTMLElem.querySelectorAll('source')]
  const ChildHTMLImgElements = [...HTMLElem.querySelectorAll('img')]

  return ChildHTMLSourceElements.some((ChildHTMLSourceElement) => Boolean(ChildHTMLSourceElement.getAttribute('srcset')?.trim()))
    && ChildHTMLImgElements.some((ChildHTMLImgElement) => Boolean(ChildHTMLImgElement.getAttribute('src')?.trim()))
}

export function IsEffectiveImageContainer(HTMLElem: HTMLElement): boolean {
  if (!HTMLElem) return false
  if (HTMLElem.tagName.toLowerCase() === 'picture') return IsEffectiveHTMLPicture(HTMLElem)
  if (HTMLElem.tagName.toLowerCase() !== 'img') return false

  return IsDisplayedElement(HTMLElem) && Boolean(HTMLElem.getAttribute('src')?.trim())

}