const StorageSystem = browser.storage.local;

(() => {
    if(window.hasDafterRun) {
        return
    }
    window.hasDafterRun = true

    const PageTypeUnknown   = 0
    const PageTypeSearch    = 1
    const PageTypeProperty  = 2

    const PriceDirectionUp      = 0
    const PriceDirectionDown    = 1
    const PriceDirectionSame    = 2

    function getPageType() {
        if(document.querySelector('div[data-testid="searchFiltersDesktop"]') !== null) {
            return PageTypeSearch
        }
        return PageTypeUnknown
    }

    function getPrice(element) {
        const priceEl = element.querySelector('div[data-testid="price"] > span')

        if(priceEl === null || priceEl.innerText === "Price on Application") {
            return null
        }

        const cleaned = priceEl.innerText.replaceAll(/[€,]/g, "")

        return parseFloat(cleaned)
    }

    function getLastPriceChange(entry) {
        if('prices' in entry && entry.prices.length > 1) {
            const latest    = entry.prices[entry.prices.length - 1]
            const previous  = entry.prices[entry.prices.length - 2]

            return latest.price - previous.price
        }

        return 0
    }

    function getPriceDirectionSince(entry, since) {
        if('prices' in entry && entry.prices.length > 1) {
            const latest    = entry.prices[entry.prices.length - 1]
            const previous  = entry.prices[entry.prices.length - 2]

            if(previous.date > since) {
                if(previous.price < latest.price) {
                    return PriceDirectionUp
                } else {
                    return PriceDirectionDown
                }
            }
        }

        return PriceDirectionSame
    }

    function getAddress(element) {
        const addressEl = element.querySelector('p[data-testid="address"]')

        if(addressEl === null) {
            return null
        }

        return addressEl.innerText
    }

    function getSearchResults() {
        let results = []
        
        document.querySelectorAll('li[data-testid^="result-').forEach((element, index, all) => {
            const resultId = parseInt(element.dataset.testid.substring("result-".length))

            const result = {
                id:         resultId,
                price:      getPrice(element),
                address:    getAddress(element),
                element:    element
            }

            results.push(result)
        })
        
        return results
    }

    async function saveSearchResults(results) {
        return StorageSystem.get("properties")
        .then(({properties: all}) => {           
            delete all.properties
            const properties = results.reduce((all, result) => {
                let entry = all[result.id] || {
                    id:         result.id,
                    seen:       new Date(),
                    address:    result.address,
                    hidden:     false,
                    prices:     []
                }

                entry.prices.push({date: new Date(), price: result.price})

                return {...all, [result.id]: {...entry, prices: entry.prices.filter((obj, index, all) => 
                    index > 0 ? all[index-1].price !== obj.price : true
                )}}
            }, all)

            StorageSystem.set({properties})
        })
        .catch(() => {
            const properties = results.reduce((all, result) => {
                return {...all, [result.id]: {
                    id:         result.id,
                    seen:       new Date(),
                    address:    result.address,
                    hidden:     false,
                    prices:     [{date: new Date(), price: result.price}]
                }}
            }, {})

            StorageSystem.set({properties: properties})
        })
        .then(() => StorageSystem.get("properties"))
        .then(({properties: all}) => {
            return results.map(result => {
                return {...result, prices: all[result.id].prices, seen: all[result.id].seen, hidden: all[result.id].hidden}
            })
        })
    }

    function daysAgo(numDays, date = new Date()) {
        date.setDate(date.getDate() - numDays)
        return date
    }

    function toggleHidden(element, event) {
        const id        = element.target.dataset.id
        const hidden    = element.target.dataset.hidden === "true"

        const ad = document.querySelector(`li[data-testid="result-${id}"]`)

        if(ad) {
            if(hidden) {
                ad.querySelector('div[data-testid="card-wrapper"]').style.display = "block"
                ad.querySelector('div[data-testid="agent-branding-top"]').style.display = "block"
                element.target.innerText = "Hide"
                console.log("Showing Ad " + id)
            } else {
                ad.querySelector('div[data-testid="card-wrapper"]').style.display = "none"
                ad.querySelector('div[data-testid="agent-branding-top"]').style.display = "none"
                element.target.innerText = "Show"
                console.log("Hiding Ad " + id)
            }
        } 

        element.target.dataset.hidden = !hidden

        StorageSystem.get("properties")
        .then(({properties: all}) => {
            const match = all[id]

            if(match) {
                StorageSystem.set({properties: {...all, [id]: {...match, hidden: !hidden}}})
            }
        })
    }

    function updateDOM(properties) {
        properties.forEach(property => {
            if(property.hidden === true) {
                property.element.querySelector('div[data-testid="card-wrapper"]').style.display = "none"
                property.element.querySelector('div[data-testid="agent-branding-top"]').style.display = "none"
            } else {
                property.element.querySelector('div[data-testid="card-wrapper"]').style.display = "block"
                property.element.querySelector('div[data-testid="agent-branding-top"]').style.display = "block"
            }

            property.element.querySelectorAll(".dafter").forEach(el => el.remove())

            const node = document.createElement("div")
            node.className = "dafter"
            node.style.display = "flex"
            node.style.flexDirection = "row"
            node.style.justifyContent = "space-between"
            node.style.borderTop = "1px solid #BBBBBB"
            node.style.padding = "1rem 1.5rem"
            node.style.backgroundColor = "#FFFFFF"
            node.style.fontWeight = 700
            node.style.textDecoration = "none"
            
            switch(getPriceDirectionSince(property, daysAgo(1))) {
                case PriceDirectionSame: {
                    const text = document.createTextNode("Price Unchanged")
                    node.style.color = "black"
                    node.appendChild(text)
                }
                break;

                case PriceDirectionDown: {
                    const text = document.createTextNode("Price Dropped by €" + getLastPriceChange(property) * -1)
                    node.style.color = "green"
                    node.appendChild(text)
                }
                break;

                case PriceDirectionUp: {
                    const text = document.createTextNode("Price Increased by €" + getLastPriceChange(property))
                    node.style.color = "red"
                    node.appendChild(text)
                }
                break;
            }

            const controls = document.createElement("div")
            controls.style.display = "flex"
            controls.style.flexDirection = "row"

            const filterButton = document.createElement("button")
            filterButton.dataset.id     = property.id
            filterButton.dataset.hidden = property.hidden
            filterButton.addEventListener("click", toggleHidden)
            if(property.hidden) {
                filterButton.innerText = "Show"
            } else {
                filterButton.innerText = "Hide"
            }

            controls.appendChild(filterButton)
            node.appendChild(controls)

            property.element.appendChild(node)
        })
    }

    switch(getPageType()) {
        case PageTypeSearch: {
            const searchResults = getSearchResults()

            saveSearchResults(searchResults)
            .then(results => {
                updateDOM(results)
            })
        }
        break;

        default:
            console.log("Unknown Page Type")
    }
})()