import DynamicSectionElement from '@/scripts/dynamic-section-element.js'

class SiteHeader extends DynamicSectionElement {
  onClickSearch () {
    const searchContainer = this.querySelector('[data-search]')

    if (searchContainer) {
      if (searchContainer.classList.contains('hidden')) {
        searchContainer.classList.remove('hidden')
      } else {
        searchContainer.classList.add('hidden')
      }
    } else {
      document.querySelector('input#Search').focus()
    }
  }
}

// Use base DynamicSectionElement class to enable replacing of content loaded from Section Rendering API
customElements.define('site-header', SiteHeader)
