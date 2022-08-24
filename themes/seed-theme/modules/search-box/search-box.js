import _ from 'lodash'

class SearchBox extends HTMLElement {
  constructor () {
    super()

    this.searchInput = this.querySelector('input[type="search"]')
    this.searchSuggestions = this.querySelector('#search-suggestions')

    this.searchInput.addEventListener(
      'input',
      _.debounce(this.onSearchInputChange.bind(this), 300, { leading: false, trailing: true })
    )

    this.searchTypeOptions = this.querySelectorAll('input[name="type"]')

    if (this.searchTypeOptions.length) {
      this.initSearchTypeOptions()
    }
  }

  onSearchInputChange () {
    const searchTerm = this.searchInput.value.trim()

    if (!searchTerm.length) {
      this.close()
      return
    }

    this.getSuggestions(searchTerm)
  }

  getSuggestions (searchTerm) {
    fetch(`/search/suggest?q=${searchTerm}&resources[type]=product,page,article,collection&resources[limit]=4&section_id=search-suggestions`)
      .then((response) => {
        if (!response.ok) {
          this.close()
          throw new Error(response.status)
        }

        return response.text()
      })
      .then((text) => {
        const resultsMarkup = new DOMParser().parseFromString(text, 'text/html').querySelector('#shopify-section-search-suggestions').innerHTML
        this.searchSuggestions.innerHTML = resultsMarkup
        this.open()
      })
      .catch((error) => {
        this.close()
        throw error
      })
  }

  open () {
    this.searchSuggestions.style.display = 'block'
  }

  close () {
    this.searchSuggestions.style.display = 'none'
  }

  initSearchTypeOptions () {
    this.searchTypeOptions.forEach((el) => {
      if (!el.checked) {
        const params = new URLSearchParams(new FormData(el.closest('form')))
        params.set('type', el.value)
        params.set('sections', 'search-results')
        const url = `${window.location.origin}${window.location.pathname}?${params}`

        fetch(url)
          .then((response) => response.json())
          .then((responseJson) => {
            const newSection = new DOMParser().parseFromString(responseJson['search-results'], 'text/html')
            const selector = `[data-slot="search-type-count-${el.value}"]`
            this.querySelector(selector).innerHTML = newSection.querySelector(selector).innerHTML
          })
      }
    })
  }
}

customElements.define('search-box', SearchBox)
